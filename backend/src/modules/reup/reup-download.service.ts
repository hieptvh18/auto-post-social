import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  MediaUploadSource,
  ReupVideoStatus,
  type ReupVideo,
} from '../../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import {
  REUP_DOWNLOADER,
  type ReupDownloaderPort,
} from '../../infra/reup-downloader/reup-downloader.interface';
import { AuditAction, AuditService } from '../audit/audit.service';
import { MediaUploadJobsRepository } from '../media-upload-jobs/media-upload-jobs.repository';
import {
  buildMediaJobOptions,
  MEDIA_UPLOAD_QUEUE,
  type MediaUploadJobData,
} from '../media-upload-jobs/media-upload.constants';
import { buildReupCaption } from './reup.constants';
import { ReupTopicsRepository } from './reup-topics.repository';
import { ReupVideosRepository } from './reup-videos.repository';

/** Một lượt worker chạy — quy đổi từ thông tin retry của BullMQ. */
export interface ProcessReupDownloadInput {
  reupVideoId: string;
  attemptNo: number;
  isLastAttempt: boolean;
}

/**
 * Tải video về đĩa rồi **giao cho ống `MediaUploadJob` có sẵn** đẩy lên Drive
 * (QĐ-3) — không viết đường upload Drive thứ hai.
 *
 * ```text
 * PENDING → DOWNLOADING → DOWNLOADED → UPLOADING → (hook) → IMPORTED
 * ```
 * Chặng cuối do worker `media-upload` gọi ngược lại qua
 * `MediaUploadCompletionHook` (plan 29 §3.3 cách a) — xem `reup-media.hook.ts`.
 */
@Injectable()
export class ReupDownloadService {
  private readonly logger = new Logger(ReupDownloadService.name);

  constructor(
    private readonly videos: ReupVideosRepository,
    private readonly topics: ReupTopicsRepository,
    private readonly mediaJobs: MediaUploadJobsRepository,
    private readonly config: AppConfigService,
    private readonly auditService: AuditService,
    @Inject(REUP_DOWNLOADER)
    private readonly downloader: ReupDownloaderPort,
    // Đẩy thẳng vào hàng đợi `media-upload` có sẵn (QĐ-3) — dùng lại đúng worker
    // đang chạy cho upload tay, không viết đường lên Drive thứ hai.
    @InjectQueue(MEDIA_UPLOAD_QUEUE)
    private readonly mediaQueue: Queue<MediaUploadJobData>,
  ) {}

  async process(input: ProcessReupDownloadInput): Promise<void> {
    const video = await this.videos.findById(input.reupVideoId);
    if (video === null) {
      this.logger.warn(`Video reup ${input.reupVideoId} không còn tồn tại`);
      return;
    }
    // Đã xong ở lượt khác — chạy tiếp chỉ tạo bài trùng (cùng khuôn media-upload).
    if (video.status !== ReupVideoStatus.PENDING) {
      this.logger.warn(
        `Bỏ qua video reup ${video.id}: trạng thái hiện tại là ${video.status}`,
      );
      return;
    }

    const topic = await this.topics.findById(video.topicId);
    if (topic === null) {
      await this.fail(video, 'Chủ đề đã bị xoá', true);
      return;
    }

    await this.videos.update(video.id, {
      status: ReupVideoStatus.DOWNLOADING,
      attemptCount: input.attemptNo,
    });

    // Thư mục DUY NHẤT theo video (cạm bẫy C5): `downloader.py` bỏ qua file đã
    // tồn tại >10KB nên dùng thư mục chung là job sau ăn nhầm file job trước.
    const outDir = join(this.config.reup.tmpDir, video.id);

    try {
      const file = await this.downloader.download({
        url: video.sourceUrl,
        outDir,
      });

      await this.videos.update(video.id, {
        status: ReupVideoStatus.DOWNLOADED,
        localPath: file.filePath,
        fileSize: BigInt(file.fileSize),
        errorMessage: null,
      });

      const mediaJob = await this.mediaJobs.create({
        source: MediaUploadSource.REUP,
        originalFilename: `${video.title.slice(0, 80)}.mp4`,
        files: [
          {
            originalFilename: `${video.title.slice(0, 80)}.mp4`,
            mimeType: file.mimeType,
            size: file.fileSize,
            tempPath: file.filePath,
          },
        ],
        metadata: {
          title: video.title.slice(0, 200),
          category: topic.category,
          caption: buildReupCaption(topic.captionTemplate, video.title),
          hashtags: topic.hashtags ?? undefined,
          assignedPageIds: [],
          // Hai field này quyết định bài ra đúng loại + đúng trạng thái NGAY LÚC
          // INSERT `content_assets`, không UPDATE sau (§6 R2).
          sourceType: 'REUP',
          autoApprove: topic.autoApprove,
        },
        // Chủ bài = người khai chủ đề. Cron không có "người dùng" nào khác, và
        // gán cho người này thì quyền/ownership/audit của bài truy được về đúng
        // nơi đã bật tính năng.
        createdById: topic.createdById,
        reupVideoId: video.id,
      });

      await this.videos.update(video.id, {
        status: ReupVideoStatus.UPLOADING,
        mediaUploadJobId: mediaJob.id,
      });

      await this.mediaQueue.add(
        MEDIA_UPLOAD_QUEUE,
        { mediaUploadJobId: mediaJob.id },
        buildMediaJobOptions(`media-upload-${mediaJob.id}`),
      );

      this.logger.log(
        `Video reup "${video.title.slice(0, 40)}" đã tải xong → job upload ${mediaJob.id}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.cleanupTempDir(outDir);
      await this.fail(video, message, input.isLastAttempt);
      // Ném lại để BullMQ backoff và đếm lượt.
      throw error;
    }
  }

  /**
   * Ghi nhận hỏng. Còn lượt retry ⇒ trả về `PENDING` để lượt sau chạy tiếp
   * (guard `status !== PENDING` ở đầu `process` sẽ chặn nếu để nguyên trạng thái
   * đang chạy — cùng cạm bẫy plan 23 đã gặp).
   */
  private async fail(
    video: ReupVideo,
    message: string,
    isLastAttempt: boolean,
  ): Promise<void> {
    await this.videos.update(video.id, {
      status: isLastAttempt ? ReupVideoStatus.FAILED : ReupVideoStatus.PENDING,
      errorMessage: message,
      localPath: null,
    });

    if (isLastAttempt) {
      this.logger.error(`Video reup ${video.id} hỏng hẳn: ${message}`);
      await this.auditService.log({
        userId: null,
        action: AuditAction.REUP_VIDEO_FAILED,
        resource: `reup_video:${video.id}`,
        afterValue: {
          title: video.title,
          sourceUrl: video.sourceUrl,
          errorMessage: message,
        },
      });
    }
  }

  private async cleanupTempDir(outDir: string): Promise<void> {
    try {
      await rm(outDir, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn(
        `Không dọn được thư mục tạm ${outDir}: ${String(error)}`,
      );
    }
  }
}
