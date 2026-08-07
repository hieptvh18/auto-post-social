import { readFile, rm } from 'node:fs/promises';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import {
  MediaType,
  MediaUploadStatus,
  UserRole,
} from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AppConfigService } from '../../config/app-config.service';
import { ClockService } from '../../infra/clock/clock.service';
import { DriveStorageFactory } from '../../infra/drive/drive-storage.factory';
import { MAX_IMAGES_PER_CONTENT_ASSET } from '../content-assets/content-assets.constants';
import {
  ContentAssetsService,
  type CreateContentAssetFileInput,
} from '../content-assets/content-assets.service';
import { resolveMediaType } from '../media/media-type.util';
import { SettingsService } from '../settings/settings.service';
import type { CreateMediaUploadJobDto } from './dto/create-media-upload-job.dto';
import type { QueryMediaUploadJobsDto } from './dto/query-media-upload-jobs.dto';
import {
  toMediaUploadJobResponse,
  type MediaUploadJobResponse,
} from './media-upload-job.mapper';
import {
  MEDIA_UPLOAD_BACKOFF_MS,
  MEDIA_UPLOAD_MAX_ATTEMPTS,
  MEDIA_UPLOAD_QUEUE,
  type MediaUploadFileInfo,
  type MediaUploadJobData,
} from './media-upload.constants';
import {
  MediaUploadJobsRepository,
  type MediaUploadJobRecord,
} from './media-upload-jobs.repository';

const BYTES_PER_MB = 1024 * 1024;

/** File multer đã ghi xuống `MEDIA_UPLOAD_TMP_DIR` (diskStorage). */
export interface UploadedDiskFile {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
}

/** Tham số một lượt worker chạy — quy đổi từ thông tin retry của BullMQ. */
export interface ProcessMediaUploadInput {
  mediaUploadJobId: string;
  attemptNo: number;
  isLastAttempt: boolean;
}

@Injectable()
export class MediaUploadJobsService implements OnModuleInit {
  private readonly logger = new Logger(MediaUploadJobsService.name);

  constructor(
    private readonly repository: MediaUploadJobsRepository,
    private readonly contentAssetsService: ContentAssetsService,
    private readonly driveFactory: DriveStorageFactory,
    private readonly settingsService: SettingsService,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
    @InjectQueue(MEDIA_UPLOAD_QUEUE)
    private readonly queue: Queue<MediaUploadJobData>,
  ) {}

  /**
   * Job còn `QUEUED`/`UPLOADING_TO_DRIVE` từ phiên trước = worker đã chết giữa
   * chừng. Không cố resume (MVP): dọn hàng đợi Redis, đánh `FAILED` và xoá file
   * tạm để đĩa không phình theo mỗi lần restart.
   */
  async onModuleInit(): Promise<void> {
    const stale = await this.repository.findPending();
    if (stale.length === 0) return;

    // Xoá job cũ khỏi Redis TRƯỚC khi đánh FAILED: nếu để lại, worker vừa khởi
    // động sẽ nhận đúng những job vừa bị xoá file tạm và chỉ tạo thêm rác log.
    try {
      await this.queue.obliterate({ force: true });
    } catch (error) {
      this.logger.warn(`Không dọn được hàng đợi upload: ${String(error)}`);
    }

    for (const job of stale) {
      await this.removeTempFiles(job);
      await this.repository.update(job.id, {
        status: MediaUploadStatus.FAILED,
        filesRemovedAt: this.clock.now(),
        errorMessage:
          'Server khởi động lại khi file đang được xử lý — vui lòng upload lại file này.',
      });
    }
    this.logger.warn(
      `Đã đánh FAILED ${stale.length} job upload còn dở từ phiên trước`,
    );
  }

  /**
   * Nhận file đã nằm trên đĩa + field form ⇒ tạo job và đẩy vào hàng đợi. Trả về
   * ngay (202) — phần đẩy Drive do worker làm, người dùng bấm Upload tiếp được.
   */
  async createJob(
    files: UploadedDiskFile[],
    dto: CreateMediaUploadJobDto,
    actor: AuthenticatedUser,
  ): Promise<MediaUploadJobResponse> {
    try {
      const infos = await this.validateFiles(files);
      const job = await this.repository.create({
        originalFilename: infos[0].originalFilename,
        files: infos,
        metadata: {
          title: dto.title,
          description: dto.description,
          category: dto.category,
          caption: dto.caption,
          hashtags: dto.hashtags,
          assignedPageIds: dto.assignedPageIds ?? [],
          editorId: dto.editorId,
        },
        createdById: actor.id,
      });

      await this.enqueue(job.id, `media-upload-${job.id}`);
      return toMediaUploadJobResponse(job);
    } catch (error) {
      // Không tạo được job ⇒ file tạm không còn ai sở hữu, xoá ngay.
      await this.removeFilePaths(files.map((file) => file.path));
      throw error;
    }
  }

  async findAll(
    query: QueryMediaUploadJobsDto,
    actor: AuthenticatedUser,
  ): Promise<MediaUploadJobResponse[]> {
    // CONTENT chỉ thấy job của mình, y hệt scope của `GET /content-assets`.
    const scopeToSelf = actor.role === UserRole.CONTENT || query.mine !== false;

    const jobs = await this.repository.findMany({
      createdById: scopeToSelf ? actor.id : undefined,
      status: query.status,
      limit: query.limit,
    });
    return jobs.map(toMediaUploadJobResponse);
  }

  /** Đẩy lại một job `FAILED` mà **không** bắt người dùng chọn lại file. */
  async retry(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<MediaUploadJobResponse> {
    const job = await this.getOrFail(id);
    this.assertOwnership(job, actor);

    if (job.status !== MediaUploadStatus.FAILED) {
      throw new UnprocessableEntityException(
        'Chỉ thử lại được job đang ở trạng thái thất bại',
      );
    }
    if (job.filesRemovedAt !== null) {
      throw new UnprocessableEntityException(
        'File tạm của job này đã bị dọn — vui lòng chọn lại file và upload lại',
      );
    }

    const updated = await this.repository.update(id, {
      status: MediaUploadStatus.QUEUED,
      errorMessage: null,
    });
    // Bull bỏ qua LẶNG LẼ khi add trùng jobId đã tồn tại trong Redis ⇒ phải xoá
    // bản cũ và dùng id mới (cùng cạm bẫy đã gặp ở publish job retry, plan 07).
    if (job.bullJobId !== null) {
      await this.queue.remove(job.bullJobId).catch(() => undefined);
    }
    await this.enqueue(id, `media-upload-${id}-retry-${Date.now()}`);

    return toMediaUploadJobResponse(updated);
  }

  /**
   * Một lượt worker: đẩy toàn bộ file của job lên Drive rồi tạo bài qua **đúng**
   * `ContentAssetsService.create()` mà `POST /content-assets` dùng.
   */
  async process(input: ProcessMediaUploadInput): Promise<void> {
    const job = await this.repository.findById(input.mediaUploadJobId);
    if (job === null) {
      this.logger.warn(
        `Job upload ${input.mediaUploadJobId} không còn tồn tại`,
      );
      return;
    }
    // Job đã bị dọn/đã xong ở phiên khác — chạy tiếp chỉ tạo bài trùng.
    if (job.status !== MediaUploadStatus.QUEUED) {
      this.logger.warn(
        `Bỏ qua job upload ${job.id}: trạng thái hiện tại là ${job.status}`,
      );
      return;
    }

    await this.repository.update(job.id, {
      status: MediaUploadStatus.UPLOADING_TO_DRIVE,
      attemptCount: input.attemptNo,
    });

    try {
      const contentAssetId = await this.uploadAndCreateAsset(job);
      await this.removeTempFiles(job);
      await this.repository.update(job.id, {
        status: MediaUploadStatus.SUCCESS,
        contentAssetId,
        errorMessage: null,
        filesRemovedAt: this.clock.now(),
      });
      this.logger.log(`Job upload ${job.id} xong → content ${contentAssetId}`);
    } catch (error) {
      const message = messageOf(error);
      // Còn lượt thử ⇒ trả về QUEUED để lượt sau chạy tiếp (và job vẫn được
      // tính là "đang chiếm chỗ" ở guard giới hạn). Hết lượt mới là FAILED.
      await this.repository.update(job.id, {
        status: input.isLastAttempt
          ? MediaUploadStatus.FAILED
          : MediaUploadStatus.QUEUED,
        errorMessage: message,
      });
      this.logger.error(
        `Job upload ${job.id} lỗi (lượt ${input.attemptNo}/${MEDIA_UPLOAD_MAX_ATTEMPTS}): ${message}`,
      );
      // GIỮ file tạm để "Thử lại" không bắt chọn lại file.
      throw error;
    }
  }

  /**
   * Dọn job đã kết thúc quá hạn giữ: xoá file tạm còn sót rồi xoá luôn dòng —
   * job `FAILED` để lại file là đường phình đĩa chắc chắn nhất.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCleanupCron(): Promise<void> {
    await this.cleanup(this.clock.now());
  }

  /** Tách khỏi cron và nhận `now` để test gọi được với thời điểm giả (rule 01). */
  async cleanup(now: Date): Promise<number> {
    const before = new Date(
      now.getTime() - this.config.mediaUpload.retentionMs,
    );
    const expired = await this.repository.findTerminalBefore(before);
    if (expired.length === 0) return 0;

    for (const job of expired) {
      await this.removeTempFiles(job);
    }
    return this.repository.deleteMany(expired.map((job) => job.id));
  }

  private async uploadAndCreateAsset(
    job: MediaUploadJobRecord,
  ): Promise<string> {
    const storage = await this.driveFactory.get();
    const uploaded: {
      fileId: string;
      driveUrl: string | null;
      thumbnailUrl: string | null;
      mimeType: string;
      size: number;
    }[] = [];

    // Tuần tự trong 1 job: song song hoá ở đây sẽ nhân RAM lên theo số ảnh,
    // trong khi độ song song mong muốn đã được điều khiển bằng concurrency worker.
    for (const file of job.files) {
      const buffer = await readFile(file.tempPath);
      const result = await storage.upload({
        filename: file.originalFilename,
        mimeType: file.mimeType,
        buffer,
      });
      uploaded.push({
        fileId: result.fileId,
        driveUrl: result.webViewLink,
        thumbnailUrl: result.thumbnailLink,
        mimeType: result.mimeType,
        size: result.size,
      });
    }

    const [primary, ...extras] = uploaded;
    const extraFiles: CreateContentAssetFileInput[] = extras.map((file) => ({
      driveFileId: file.fileId,
      driveUrl: file.driveUrl ?? undefined,
      thumbnailUrl: file.thumbnailUrl ?? undefined,
      mimeType: file.mimeType,
      fileSize: file.size,
    }));

    const created = await this.contentAssetsService.create(
      {
        title: job.metadata.title,
        description: job.metadata.description,
        category: job.metadata.category,
        caption: job.metadata.caption,
        hashtags: job.metadata.hashtags,
        mediaType: resolveMediaType(job.files[0].mimeType),
        driveFileId: primary.fileId,
        driveUrl: primary.driveUrl ?? undefined,
        thumbnailUrl: primary.thumbnailUrl ?? undefined,
        mimeType: primary.mimeType,
        fileSize: primary.size,
        editorId: job.metadata.editorId,
        assignedPageIds: job.metadata.assignedPageIds,
        extraFiles,
      },
      // Actor = người bấm Upload, không phải "Bot": quyền duyệt/ownership của
      // bài phải giống hệt khi họ gọi `POST /content-assets` trực tiếp.
      {
        id: job.createdBy.id,
        email: job.createdBy.email,
        name: job.createdBy.name,
        role: job.createdBy.role,
      },
    );

    return created.id;
  }

  /**
   * Kiểm tra ngay lúc nhận file (trước khi tạo job): định dạng, giới hạn dung
   * lượng **động** theo Settings, và luật "nhiều ảnh thì được, nhiều video thì
   * không" — hỏng ở đây thì chưa có dòng job mờ nào hiện ra trên UI.
   */
  private async validateFiles(
    files: UploadedDiskFile[],
  ): Promise<MediaUploadFileInfo[]> {
    if (files.length === 0) {
      throw new BadRequestException('Thiếu file upload (field "files")');
    }

    const mediaTypes = files.map((file) => resolveMediaType(file.mimetype));
    if (mediaTypes.includes(MediaType.video) && files.length > 1) {
      throw new BadRequestException(
        'Video chỉ đăng được 1 file mỗi bài — Facebook không ghép nhiều video vào một bài',
      );
    }
    if (files.length > MAX_IMAGES_PER_CONTENT_ASSET) {
      throw new BadRequestException(
        `Một bài chỉ ghép được tối đa ${MAX_IMAGES_PER_CONTENT_ASSET} ảnh (giới hạn của Facebook), đang gửi ${files.length}`,
      );
    }

    const { maxUploadMb } = await this.settingsService.getDriveConfig();
    const maxBytes = maxUploadMb * BYTES_PER_MB;
    for (const file of files) {
      if (file.size > maxBytes) {
        throw new BadRequestException(
          `File "${decodeFilename(file.originalname)}" vượt giới hạn ${maxUploadMb}MB (${(
            file.size / BYTES_PER_MB
          ).toFixed(1)}MB)`,
        );
      }
    }

    return files.map((file) => ({
      // Busboy decode header multipart bằng latin1 ⇒ tên file tiếng Việt bị
      // mojibake nếu không decode lại (cùng lỗi đã vá ở `media.controller.ts`).
      originalFilename: decodeFilename(file.originalname),
      mimeType: file.mimetype,
      size: file.size,
      tempPath: file.path,
    }));
  }

  private async enqueue(jobId: string, bullJobId: string): Promise<void> {
    await this.queue.add(
      MEDIA_UPLOAD_QUEUE,
      { mediaUploadJobId: jobId },
      {
        jobId: bullJobId,
        attempts: MEDIA_UPLOAD_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: MEDIA_UPLOAD_BACKOFF_MS },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    await this.repository.update(jobId, { bullJobId });
  }

  private async removeTempFiles(job: MediaUploadJobRecord): Promise<void> {
    await this.removeFilePaths(job.files.map((file) => file.tempPath));
  }

  private async removeFilePaths(paths: string[]): Promise<void> {
    for (const path of paths) {
      try {
        await rm(path, { force: true });
      } catch (error) {
        // Xoá hụt chỉ tốn đĩa — không được làm hỏng luồng đang chạy.
        this.logger.warn(`Không xoá được file tạm ${path}: ${String(error)}`);
      }
    }
  }

  private async getOrFail(id: string): Promise<MediaUploadJobRecord> {
    const job = await this.repository.findById(id);
    if (job === null) throw new NotFoundException('Không tìm thấy job upload');
    return job;
  }

  /** Chủ job hoặc ADMIN mới thử lại được (plan 23 §3.4). */
  private assertOwnership(
    job: MediaUploadJobRecord,
    actor: AuthenticatedUser,
  ): void {
    if (actor.role === UserRole.ADMIN) return;
    if (job.createdById !== actor.id) {
      throw new ForbiddenException('Chỉ thao tác được trên job của chính mình');
    }
  }
}

/** Tên file multipart luôn tới dưới dạng latin1 — trả về chuỗi UTF-8 đúng. */
function decodeFilename(raw: string): string {
  return Buffer.from(raw, 'latin1').toString('utf8');
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return 'Lỗi không xác định khi đẩy file lên Google Drive';
}
