import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  MediaType,
  MediaUploadSource,
  MediaUploadStatus,
} from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AppConfigService } from '../../config/app-config.service';
import type {
  DriveFileMeta,
  DriveStorage,
} from '../../infra/drive/drive-storage.interface';
import { DriveStorageFactory } from '../../infra/drive/drive-storage.factory';
import {
  DriveFileError,
  type DriveFileErrorCode,
} from '../../infra/drive/drive.errors';
import { MAX_IMAGES_PER_CONTENT_ASSET } from '../content-assets/content-assets.constants';
import {
  ContentAssetsService,
  type CreateContentAssetFileInput,
} from '../content-assets/content-assets.service';
import {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_VIDEO_MIMES,
} from '../media/media-type.util';
import { SettingsService } from '../settings/settings.service';
import { parseDriveLink, titleFromFilename } from './drive-link.util';
import type { CreateDriveImportDto } from './dto/create-drive-import.dto';
import type { InspectDriveLinksDto } from './dto/inspect-drive-links.dto';
import {
  toMediaUploadJobResponse,
  type MediaUploadJobResponse,
} from './media-upload-job.mapper';
import {
  MediaUploadJobsRepository,
  type MediaUploadJobRecord,
} from './media-upload-jobs.repository';
import {
  MediaUploadJobsService,
  type ProcessMediaUploadInput,
} from './media-upload-jobs.service';
import {
  buildMediaJobOptions,
  DEFAULT_IMPORT_CATEGORY,
  DRIVE_IMPORT_QUEUE,
  EMPTY_CAPTION_PLACEHOLDER,
  type MediaUploadFileInfo,
  type MediaUploadJobData,
} from './media-upload.constants';

const BYTES_PER_MB = 1024 * 1024;

/** Số `files.get` chạy song song khi soi link — tránh đụng rate limit Drive. */
const INSPECT_CONCURRENCY = 5;

/** Vì sao một dòng link bị bỏ qua. */
export type DriveImportReason =
  | 'LINK_INVALID'
  | 'IS_FOLDER'
  | 'DUPLICATE_IN_LIST'
  | 'NOT_FOUND_OR_NO_ACCESS'
  | 'COPY_DISABLED'
  | 'NOT_MEDIA'
  | 'TOO_LARGE'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

/** Một dòng KHÔNG nhập được, kèm cách khắc phục để hiện thẳng lên modal. */
export interface DriveImportSkipped {
  /** Vị trí dòng người dùng dán (1-based). */
  line: number;
  link: string;
  reason: DriveImportReason;
  message: string;
}

export interface DriveImportResult {
  /** Job đã tạo — mỗi job là một dòng "mờ" trên bảng kho bài. */
  jobs: MediaUploadJobResponse[];
  /** Dòng bị bỏ qua. Rỗng = nhập trọn vẹn. */
  skipped: DriveImportSkipped[];
  /** File đã từng nhập vào kho — cảnh báo, KHÔNG chặn. */
  duplicates: { line: number; link: string; title: string }[];
}

/**
 * Kết quả dò một dòng (chỉ đọc). UI dùng để **khoá checkbox "gộp ảnh"** khi lô
 * có video — Facebook không ghép video, cũng không trộn ảnh–video, vào một bài.
 */
export interface DriveImportInspectItem {
  line: number;
  link: string;
  ok: boolean;
  /** Tên file trên Drive; null khi không đọc được. */
  name: string | null;
  /** `null` = chưa xác định được (link hỏng / không có quyền / không phải media). */
  mediaType: MediaType | null;
  reason: DriveImportReason | null;
  message: string | null;
}

/** Một dòng đã soi xong: hoặc dùng được (`file`), hoặc bị loại (`skip`). */
interface InspectedLine {
  line: number;
  link: string;
  file?: MediaUploadFileInfo & { title: string };
  skip?: Omit<DriveImportSkipped, 'line' | 'link'>;
  duplicateTitle?: string;
}

/**
 * Nhập bài từ link Google Drive (plan 24).
 *
 * **Ràng buộc cốt lõi:** file nguồn đi vào folder của tool bằng `files.copy` —
 * copy phía server của Google, **0 byte đi qua backend**. Không được thay bằng
 * download rồi upload lại (plan 24 §0.1), kể cả khi thấy tiện hơn.
 *
 * **Ngữ nghĩa gọi (yêu cầu user 2026-08-07):** một lần submit = danh sách link;
 * dòng hỏng **không** làm hỏng cả lô — chúng bị bỏ qua và trả về trong `skipped`
 * để UI nói rõ dòng nào lỗi vì sao. Ném lỗi cả request chỉ dành cho trường hợp
 * **không dòng nào** dùng được, hoặc yêu cầu gộp ảnh bất khả thi.
 */
@Injectable()
export class DriveImportsService {
  private readonly logger = new Logger(DriveImportsService.name);

  constructor(
    private readonly repository: MediaUploadJobsRepository,
    private readonly jobsService: MediaUploadJobsService,
    private readonly contentAssetsService: ContentAssetsService,
    private readonly driveFactory: DriveStorageFactory,
    private readonly settingsService: SettingsService,
    private readonly config: AppConfigService,
    @InjectQueue(DRIVE_IMPORT_QUEUE)
    private readonly queue: Queue<MediaUploadJobData>,
  ) {}

  /**
   * Dò trước loại file của từng link. **Không tạo gì**, gọi lại bao nhiêu lần
   * cũng được — FE gọi ngầm sau khi người dùng ngừng gõ để quyết định có cho
   * tick "gộp ảnh" hay không.
   */
  async inspectLinks(
    dto: InspectDriveLinksDto,
  ): Promise<{ items: DriveImportInspectItem[] }> {
    const lines = this.normalizeLines(dto.links);
    if (lines.length === 0) return { items: [] };

    const inspected = await this.inspect(lines);
    return {
      items: inspected.map((item) => ({
        line: item.line,
        link: item.link,
        ok: item.file !== undefined,
        name: item.file?.originalFilename ?? null,
        mediaType:
          item.file === undefined ? null : detectMediaType(item.file.mimeType),
        reason: item.skip?.reason ?? null,
        message: item.skip?.message ?? null,
      })),
    };
  }

  async createJobs(
    dto: CreateDriveImportDto,
    actor: AuthenticatedUser,
  ): Promise<DriveImportResult> {
    const lines = this.normalizeLines(dto.links);
    if (lines.length === 0) {
      throw new BadRequestException('Chưa dán link nào');
    }

    const inspected = await this.inspect(lines);
    const usable = inspected.filter((item) => item.file !== undefined);
    const skipped: DriveImportSkipped[] = inspected.flatMap((item) =>
      item.skip === undefined
        ? []
        : [{ line: item.line, link: item.link, ...item.skip }],
    );

    if (usable.length === 0) {
      // Không có gì để làm ⇒ báo lỗi kèm lý do dòng đầu, thay vì trả 202 "thành
      // công" cho một lần nhập thật ra không nhập được gì.
      throw new BadRequestException(
        skipped[0]?.message ?? 'Không có link nào dùng được',
      );
    }

    const groups = this.groupFiles(usable, dto.mergeImagesIntoOnePost === true);
    const jobs: MediaUploadJobResponse[] = [];
    for (const group of groups) {
      const job = await this.repository.create({
        source: MediaUploadSource.DRIVE_LINK,
        originalFilename: group.files[0].originalFilename,
        files: group.files,
        metadata: {
          title: group.title,
          category: DEFAULT_IMPORT_CATEGORY,
          // Chưa có caption ⇒ bài BẮT BUỘC vào Chờ duyệt, kể cả actor là ADMIN:
          // '-' là chỗ giữ chỗ, để Bot đăng nó lên Page thật là hỏng thật.
          caption: EMPTY_CAPTION_PLACEHOLDER,
          forceReview: true,
          assignedPageIds: [],
        },
        createdById: actor.id,
      });
      await this.enqueue(job.id, `${DRIVE_IMPORT_QUEUE}-${job.id}`);
      jobs.push(toMediaUploadJobResponse(job));
    }

    this.logger.log(
      `Nhập từ Drive: ${lines.length} link ⇒ ${jobs.length} job, bỏ qua ${skipped.length} (actor ${actor.id})`,
    );

    return {
      jobs,
      skipped,
      duplicates: usable.flatMap((item) =>
        item.duplicateTitle === undefined
          ? []
          : [{ line: item.line, link: item.link, title: item.duplicateTitle }],
      ),
    };
  }

  /** Bỏ dòng rỗng + chặn trần số link. Dùng chung cho cả dò lẫn nhập. */
  private normalizeLines(links: string[]): string[] {
    const lines = links
      .map((link) => link.trim())
      .filter((link) => link !== '');
    const max = this.config.driveImport.maxLinksPerRequest;
    if (lines.length > max) {
      throw new BadRequestException(
        `Mỗi lần chỉ nhập được tối đa ${max} link, đang gửi ${lines.length}`,
      );
    }
    return lines;
  }

  /** Một lượt worker — khung trạng thái dùng chung với luồng upload từ máy. */
  async processImport(input: ProcessMediaUploadInput): Promise<void> {
    await this.jobsService.runJob(
      input,
      MediaUploadSource.DRIVE_LINK,
      MediaUploadStatus.COPYING_FROM_DRIVE,
      (job) => this.copyAndCreateAsset(job),
    );
  }

  /**
   * Soi từng dòng: parse link → đọc metadata Drive → quyết định dùng được hay
   * không. Không tạo gì cả; chỉ đọc.
   */
  private async inspect(lines: string[]): Promise<InspectedLine[]> {
    const [storage, accountEmail, driveConfig] = await Promise.all([
      this.driveFactory.get(),
      this.settingsService.getDriveAccountEmail(),
      this.settingsService.getDriveConfig(),
    ]);

    const items: InspectedLine[] = lines.map((link, index) => ({
      line: index + 1,
      link,
    }));
    const seen = new Set<string>();
    const pending: { item: InspectedLine; fileId: string }[] = [];

    for (const item of items) {
      const parsed = parseDriveLink(item.link);
      if (parsed === null) {
        item.skip = {
          reason: 'LINK_INVALID',
          message: 'Không nhận ra link Google Drive',
        };
        continue;
      }
      if (parsed.kind === 'folder') {
        item.skip = {
          reason: 'IS_FOLDER',
          message: 'Đây là link thư mục — hãy dán link của từng file bên trong',
        };
        continue;
      }
      if (seen.has(parsed.id)) {
        item.skip = {
          reason: 'DUPLICATE_IN_LIST',
          message: 'Link này bị dán trùng ở phía trên',
        };
        continue;
      }
      seen.add(parsed.id);
      pending.push({ item, fileId: parsed.id });
    }

    await this.mapWithLimit(pending, INSPECT_CONCURRENCY, async (entry) => {
      await this.fillFile(entry.item, entry.fileId, {
        storage,
        maxUploadMb: driveConfig.maxUploadMb,
        accountEmail,
      });
    });

    await this.markDuplicates(items);
    return items;
  }

  /** Gọi Drive cho một dòng rồi điền `file` hoặc `skip` vào chính dòng đó. */
  private async fillFile(
    item: InspectedLine,
    fileId: string,
    ctx: {
      storage: DriveStorage;
      maxUploadMb: number;
      accountEmail: string | null;
    },
  ): Promise<void> {
    let meta: DriveFileMeta;
    try {
      meta = await this.resolveTarget(ctx.storage, fileId);
    } catch (error) {
      const code: DriveFileErrorCode =
        error instanceof DriveFileError ? error.code : 'UNKNOWN';
      item.skip = {
        reason: toReason(code),
        message:
          code === 'NOT_FOUND_OR_NO_ACCESS'
            ? noAccessMessage(ctx.accountEmail)
            : error instanceof Error
              ? error.message
              : 'Không đọc được file trên Google Drive',
      };
      return;
    }

    const mediaType = detectMediaType(meta.mimeType);
    if (mediaType === null) {
      item.skip = {
        reason: 'NOT_MEDIA',
        message: `"${meta.name}" không phải ảnh/video được hỗ trợ (${[
          ...ALLOWED_IMAGE_MIMES,
          ...ALLOWED_VIDEO_MIMES,
        ].join(', ')})`,
      };
      return;
    }
    if (!meta.canCopy) {
      item.skip = {
        reason: 'COPY_DISABLED',
        message: `"${meta.name}": chủ file đã tắt quyền tải/sao chép — xin quyền Người chỉnh sửa hoặc nhờ họ bỏ tuỳ chọn đó`,
      };
      return;
    }
    if (meta.size !== null && meta.size > ctx.maxUploadMb * BYTES_PER_MB) {
      item.skip = {
        reason: 'TOO_LARGE',
        message: `"${meta.name}" vượt giới hạn ${ctx.maxUploadMb}MB (${(
          meta.size / BYTES_PER_MB
        ).toFixed(1)}MB)`,
      };
      return;
    }

    item.file = {
      originalFilename: meta.name,
      mimeType: meta.mimeType,
      size: meta.size ?? 0,
      sourceFileId: meta.fileId,
      // Tiêu đề suy ra từ tên file — modal không hỏi tiêu đề nữa.
      title: titleFromFilename(meta.name),
    };
  }

  /** Shortcut ⇒ đọc tiếp file đích, để dán link shortcut vẫn nhập được. */
  private async resolveTarget(
    storage: DriveStorage,
    fileId: string,
  ): Promise<DriveFileMeta> {
    const meta = await storage.getMetadata(fileId);
    if (meta.shortcutTargetId === null) return meta;
    return storage.getMetadata(meta.shortcutTargetId);
  }

  /** Ghi chú (không chặn) những file đã từng nhập vào kho. */
  private async markDuplicates(items: InspectedLine[]): Promise<void> {
    const fileIds = items.flatMap((item) =>
      item.file?.sourceFileId === undefined ? [] : [item.file.sourceFileId],
    );
    const imported = await this.repository.findImportedSourceFiles(fileIds);
    if (imported.length === 0) return;

    const byFileId = new Map(
      imported.map((row) => [row.sourceDriveFileId, row]),
    );
    for (const item of items) {
      const sourceFileId = item.file?.sourceFileId;
      if (sourceFileId === undefined) continue;
      const match = byFileId.get(sourceFileId);
      // Vẫn nhập — người dùng có thể cố ý nhập lại (plan 24 §3.4).
      if (match !== undefined) item.duplicateTitle = match.title;
    }
  }

  /**
   * Mặc định **mỗi dòng = một bài**. Bật gộp thì toàn bộ ảnh về **một** bài
   * nhiều ảnh (plan 22 lo phần đăng album).
   */
  private groupFiles(
    items: InspectedLine[],
    merge: boolean,
  ): { title: string; files: MediaUploadFileInfo[] }[] {
    const files = items.flatMap((item) =>
      item.file === undefined ? [] : [item.file],
    );

    if (!merge) {
      return files.map((file) => ({ title: file.title, files: [file] }));
    }

    // Facebook chỉ ghép được **ảnh** (`attached_media` chỉ nhận photo id): không
    // gộp nhiều video, cũng không trộn ảnh–video vào một bài feed.
    const videoCount = files.filter(
      (file) => detectMediaType(file.mimeType) === MediaType.video,
    ).length;
    if (videoCount > 0) {
      throw new BadRequestException(
        videoCount === files.length
          ? 'Danh sách chỉ có video nên không gộp được — Facebook không ghép nhiều video vào một bài. Bỏ tick "gộp" để mỗi video thành một bài riêng.'
          : `Có ${videoCount} video trong danh sách — Facebook không trộn ảnh và video vào một bài. Chỉ gộp được khi mọi dòng đều là ảnh.`,
      );
    }
    if (files.length > MAX_IMAGES_PER_CONTENT_ASSET) {
      throw new BadRequestException(
        `Một bài chỉ ghép được tối đa ${MAX_IMAGES_PER_CONTENT_ASSET} ảnh, đang gộp ${files.length}`,
      );
    }
    return [{ title: files[0].title, files }];
  }

  /**
   * Copy từng file rồi tạo bài qua **đúng** `ContentAssetsService.create()` mà
   * `POST /content-assets` dùng — không có bản logic tạo bài thứ hai.
   */
  private async copyAndCreateAsset(job: MediaUploadJobRecord): Promise<string> {
    const storage = await this.driveFactory.get();
    const copied: {
      fileId: string;
      driveUrl: string | null;
      thumbnailUrl: string | null;
      mimeType: string;
      size: number;
    }[] = [];

    for (const file of job.files) {
      if (file.sourceFileId === undefined) {
        throw new Error(
          `File "${file.originalFilename}" thiếu fileId nguồn — job hỏng dữ liệu`,
        );
      }
      const result = await storage.copy(
        file.sourceFileId,
        file.originalFilename,
      );
      copied.push({
        fileId: result.fileId,
        driveUrl: result.webViewLink,
        thumbnailUrl: result.thumbnailLink,
        mimeType: result.mimeType,
        size: result.size === 0 ? file.size : result.size,
      });
    }

    const [primary, ...extras] = copied;
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
        mediaType: detectMediaType(job.files[0].mimeType) ?? MediaType.image,
        driveFileId: primary.fileId,
        driveUrl: primary.driveUrl ?? undefined,
        thumbnailUrl: primary.thumbnailUrl ?? undefined,
        mimeType: primary.mimeType,
        fileSize: primary.size,
        editorId: job.metadata.editorId,
        assignedPageIds: job.metadata.assignedPageIds,
        extraFiles,
        // fileId GỐC — chỉ để cảnh báo nhập trùng lần sau. `driveFileId` ở trên
        // mới là bản copy thuộc sở hữu của tool.
        sourceDriveFileId: job.files[0].sourceFileId,
        forceReview: job.metadata.forceReview,
      },
      {
        id: job.createdBy.id,
        email: job.createdBy.email,
        name: job.createdBy.name,
        role: job.createdBy.role,
      },
    );

    return created.id;
  }

  private async enqueue(jobId: string, bullJobId: string): Promise<void> {
    await this.queue.add(
      DRIVE_IMPORT_QUEUE,
      { mediaUploadJobId: jobId },
      buildMediaJobOptions(bullJobId),
    );
    await this.repository.update(jobId, { bullJobId });
  }

  /** Chạy `worker` trên danh sách với trần song song — tránh rate limit Drive. */
  private async mapWithLimit<T>(
    items: T[],
    limit: number,
    worker: (item: T) => Promise<void>,
  ): Promise<void> {
    let cursor = 0;
    const runners = Array.from(
      { length: Math.min(limit, items.length) },
      async () => {
        while (cursor < items.length) {
          const item = items[cursor];
          cursor += 1;
          await worker(item);
        }
      },
    );
    await Promise.all(runners);
  }
}

/** Bản không ném lỗi của `resolveMediaType` — ở đây cần "null" chứ không cần 400. */
function detectMediaType(mimeType: string): MediaType | null {
  if ((ALLOWED_IMAGE_MIMES as readonly string[]).includes(mimeType)) {
    return MediaType.image;
  }
  if ((ALLOWED_VIDEO_MIMES as readonly string[]).includes(mimeType)) {
    return MediaType.video;
  }
  return null;
}

function toReason(code: DriveFileErrorCode): DriveImportReason {
  switch (code) {
    case 'NOT_FOUND_OR_NO_ACCESS':
      return 'NOT_FOUND_OR_NO_ACCESS';
    case 'RATE_LIMITED':
      return 'RATE_LIMITED';
    case 'COPY_DISABLED':
      return 'COPY_DISABLED';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Câu quan trọng nhất của feature này (§0.4): file riêng tư thì phải nói **đúng
 * email cần chia sẻ tới**, nếu không user không biết phải làm gì.
 */
function noAccessMessage(accountEmail: string | null): string {
  const target =
    accountEmail === null
      ? 'tài khoản Google Drive đang kết nối (xem ở Cài đặt chung)'
      : accountEmail;
  return (
    'File đang ở chế độ riêng tư hoặc link sai. Hãy chia sẻ file (hoặc cả thư mục chứa nó) ' +
    `cho ${target} với quyền Người xem, hoặc đổi sang "Bất kỳ ai có đường liên kết".`
  );
}
