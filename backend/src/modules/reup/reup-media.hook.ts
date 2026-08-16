import { Global, Injectable, Logger, Module } from '@nestjs/common';
import { ReupVideoStatus } from '../../../generated/prisma/client';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AuditAction, AuditService } from '../audit/audit.service';
import {
  MEDIA_UPLOAD_COMPLETION_HOOK,
  type MediaUploadCompletionHook,
} from '../media-upload-jobs/media-upload-completion.hook';
import type { MediaUploadJobRecord } from '../media-upload-jobs/media-upload-jobs.repository';
import { ReupVideosRepository } from './reup-videos.repository';

/**
 * Chặng cuối của dây chuyền reup (plan 29 §3.3 bước 6).
 *
 * Worker `media-upload` gọi vào đây sau khi đã tạo xong `content_assets`.
 * Nhánh `reupVideoId = null` (upload tay) thoát ngay ở dòng đầu ⇒ luồng cũ
 * **không bị đụng gì** (điều kiện Done, §6 R1).
 */
@Injectable()
export class ReupMediaUploadHook implements MediaUploadCompletionHook {
  private readonly logger = new Logger(ReupMediaUploadHook.name);

  constructor(
    private readonly videos: ReupVideosRepository,
    private readonly auditService: AuditService,
  ) {}

  async onJobSucceeded(
    job: MediaUploadJobRecord,
    contentAssetId: string,
  ): Promise<void> {
    if (job.reupVideoId === null) return; // upload tay — không liên quan

    const video = await this.videos.findById(job.reupVideoId);
    if (video === null) {
      this.logger.warn(
        `Job upload ${job.id} trỏ tới reup_video ${job.reupVideoId} không còn tồn tại`,
      );
      return;
    }

    await this.videos.update(video.id, {
      status: ReupVideoStatus.IMPORTED,
      contentAssetId,
      // File tạm đã được worker media-upload xoá sau khi đẩy Drive xong ⇒ đường
      // dẫn không còn ý nghĩa, xoá luôn để `/reup` không hiện path chết.
      localPath: null,
      errorMessage: null,
    });

    await this.auditService.log({
      userId: null, // Bot — cả chuỗi này chạy nền, không có người bấm
      action: AuditAction.REUP_VIDEO_IMPORTED,
      resource: `reup_video:${video.id}`,
      afterValue: {
        title: video.title,
        sourceUrl: video.sourceUrl,
        authorName: video.authorName,
        contentAssetId,
        fileSize: video.fileSize === null ? null : Number(video.fileSize),
        autoApproved: job.metadata.autoApprove === true,
      },
    });

    this.logger.log(
      `Video reup ${video.id} đã vào kho → content ${contentAssetId}`,
    );
  }

  async onJobFailed(
    job: MediaUploadJobRecord,
    message: string,
    isLastAttempt: boolean,
  ): Promise<void> {
    if (job.reupVideoId === null) return;

    const video = await this.videos.findById(job.reupVideoId);
    if (video === null) return;

    // Còn lượt retry ⇒ giữ UPLOADING, để `errorMessage` cho người vận hành thấy
    // lý do lần thử vừa rồi mà không tưởng là đã hỏng hẳn.
    await this.videos.update(video.id, {
      status: isLastAttempt ? ReupVideoStatus.FAILED : video.status,
      errorMessage: message,
    });

    if (isLastAttempt) {
      await this.auditService.log({
        userId: null,
        action: AuditAction.REUP_VIDEO_FAILED,
        resource: `reup_video:${video.id}`,
        afterValue: {
          title: video.title,
          sourceUrl: video.sourceUrl,
          errorMessage: message,
          stage: 'UPLOAD_TO_DRIVE',
        },
      });
    }
  }
}

/**
 * `@Global()` là **cách duy nhất** để `MediaUploadJobsService` (nằm ở module
 * khác) inject được hook mà module `media-upload-jobs` **không phải import**
 * module `reup`.
 *
 * Import ngược lại sẽ tạo vòng phụ thuộc và phá QĐ-6 §3 ("không module nào ngoài
 * `modules/reup` biết reup tồn tại"). Ở đây chiều phụ thuộc vẫn đúng một hướng:
 * reup → media-upload-jobs.
 */
@Global()
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [
    ReupVideosRepository,
    { provide: MEDIA_UPLOAD_COMPLETION_HOOK, useClass: ReupMediaUploadHook },
  ],
  exports: [MEDIA_UPLOAD_COMPLETION_HOOK],
})
export class ReupMediaHookModule {}
