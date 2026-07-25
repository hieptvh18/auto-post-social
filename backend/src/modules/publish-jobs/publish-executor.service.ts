import { Injectable, Logger } from '@nestjs/common';
import {
  PublishJobEventType,
  PublishStatus,
} from '../../../generated/prisma/client';
import { AuditAction, AuditService } from '../audit/audit.service';
import { FacebookPagesService } from '../facebook-pages/facebook-pages.service';
import { PublishJobEventsService } from './publish-job-events.service';
import { PublishJobsRepository } from './publish-jobs.repository';
import {
  PublishMediaService,
  describePublishError,
} from './publish-media.service';

export interface ExecuteParams {
  publishJobId: string;
  /** Lần thử thứ mấy — lấy từ `job.attemptsMade + 1` của BullMQ. */
  attemptNo: number;
  /** Hết lượt thử ⇒ job chốt FAILED; còn lượt ⇒ trả về QUEUED chờ BullMQ gọi lại. */
  isLastAttempt: boolean;
}

export type ExecuteOutcome =
  | { status: 'success'; facebookPostId: string; publishedAt: Date }
  | { status: 'skipped'; reason: string };

/** Lỗi đã được ghi vào DB rồi — nơi gọi chỉ cần quyết định retry hay trả 502. */
export class PublishExecutionError extends Error {
  constructor(
    message: string,
    readonly willRetry: boolean,
  ) {
    super(message);
    this.name = 'PublishExecutionError';
  }
}

/**
 * Thực thi một publish job đã nằm trong DB: đổi trạng thái, gọi Graph, ghi kết
 * quả + nhật ký. **Idempotent** — job không còn ở trạng thái chờ đăng thì bỏ qua,
 * vì BullMQ có thể giao cùng một job hai lần (worker chết giữa chừng, retry...).
 */
@Injectable()
export class PublishExecutorService {
  private readonly logger = new Logger(PublishExecutorService.name);

  constructor(
    private readonly repository: PublishJobsRepository,
    private readonly events: PublishJobEventsService,
    private readonly pagesService: FacebookPagesService,
    private readonly publishMedia: PublishMediaService,
    private readonly auditService: AuditService,
  ) {}

  async execute(params: ExecuteParams): Promise<ExecuteOutcome> {
    const { publishJobId, attemptNo, isLastAttempt } = params;
    const job = await this.repository.findForExecution(publishJobId);

    if (job === null) {
      return { status: 'skipped', reason: 'Job không còn tồn tại' };
    }
    // Chỉ QUEUED mới được đăng. SUCCESS/CANCELLED/FAILED ⇒ không gọi Facebook lần nữa.
    if (job.status !== PublishStatus.QUEUED) {
      this.logger.warn(
        `Bỏ qua job=${job.id} vì trạng thái đang là ${job.status}, không phải QUEUED`,
      );
      return {
        status: 'skipped',
        reason: `Job đang ở trạng thái ${job.status}`,
      };
    }

    await this.repository.markPublishing(job.id, job.contentAssetId, attemptNo);
    await this.events.log({
      publishJobId: job.id,
      attemptNo,
      event: PublishJobEventType.STARTED,
      message: `Bắt đầu đăng "${job.contentAsset.title}" lên page "${job.facebookPage.pageName}"`,
    });

    try {
      const token = await this.pagesService.getDecryptedToken(
        job.facebookPageId,
      );
      const published = await this.publishMedia.publish({
        content: job.contentAsset,
        pageId: job.facebookPage.pageId,
        accessToken: token,
        caption: job.caption,
        hashtags: job.hashtags,
      });

      const publishedAt = new Date();
      await this.repository.markSuccess({
        jobId: job.id,
        contentAssetId: job.contentAssetId,
        facebookPageId: job.facebookPageId,
        facebookPostId: published.postId,
        publishedAt,
      });
      await this.events.log({
        publishJobId: job.id,
        attemptNo,
        event: PublishJobEventType.SUCCEEDED,
        message: `Đã đăng, facebookPostId=${published.postId}`,
      });
      await this.auditService.log({
        // actor = Bot ⇒ userId null (docs/05 §8). Job đăng tay tự ghi audit riêng.
        userId: null,
        action: AuditAction.AUTO_PUBLISH,
        resource: `publish_job:${job.id}`,
        afterValue: {
          contentAssetId: job.contentAssetId,
          facebookPageId: job.facebookPageId,
          facebookPostId: published.postId,
        },
      });

      return {
        status: 'success',
        facebookPostId: published.postId,
        publishedAt,
      };
    } catch (error) {
      const reason = describePublishError(error);
      const willRetry = !isLastAttempt;

      await this.repository.markFailure(job.id, {
        contentAssetId: job.contentAssetId,
        // Còn lượt thử ⇒ về QUEUED để lần retry sau đi qua đúng cửa idempotent ở trên.
        status: willRetry ? PublishStatus.QUEUED : PublishStatus.FAILED,
        errorMessage: reason,
        attemptCount: attemptNo,
      });
      await this.events.log({
        publishJobId: job.id,
        attemptNo,
        event: PublishJobEventType.FAILED,
        message: reason,
        rawError: error,
      });
      await this.events.log({
        publishJobId: job.id,
        attemptNo,
        event: willRetry
          ? PublishJobEventType.RETRY_SCHEDULED
          : PublishJobEventType.GAVE_UP,
        message: willRetry
          ? `Sẽ thử lại (lần ${attemptNo + 1})`
          : `Đã thử ${attemptNo} lần, dừng lại`,
      });
      this.logger.error(
        `Đăng thất bại: job=${job.id} lần ${attemptNo} — ${reason}`,
      );

      throw new PublishExecutionError(reason, willRetry);
    }
  }
}
