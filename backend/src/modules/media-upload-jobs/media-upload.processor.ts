import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { MediaUploadJobsService } from './media-upload-jobs.service';
import {
  MEDIA_UPLOAD_MAX_ATTEMPTS,
  MEDIA_UPLOAD_QUEUE,
  type MediaUploadJobData,
} from './media-upload.constants';

/**
 * Worker đẩy file lên Drive. Nghiệp vụ nằm ở `MediaUploadJobsService` — ở đây
 * chỉ quy đổi thông tin retry của BullMQ và **đặt độ song song**: cửa sổ trượt N
 * job chạy cùng lúc, job xong là job kế tiếp trong hàng đợi vào ngay (không chờ
 * hết "lô"), nên vẫn giữ đúng trần N tại mọi thời điểm.
 */
@Processor(MEDIA_UPLOAD_QUEUE)
export class MediaUploadProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(MediaUploadProcessor.name);

  constructor(
    private readonly service: MediaUploadJobsService,
    private readonly config: AppConfigService,
  ) {
    super();
  }

  async process(job: Job<MediaUploadJobData>): Promise<void> {
    const attemptNo = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? MEDIA_UPLOAD_MAX_ATTEMPTS;

    await this.service.process({
      mediaUploadJobId: job.data.mediaUploadJobId,
      attemptNo,
      isLastAttempt: attemptNo >= maxAttempts,
    });
    // Lỗi đã được service ghi vào DB rồi ném lại — ném tiếp để BullMQ backoff.
  }

  onModuleInit(): void {
    // `@Processor()` chỉ nhận hằng số lúc decorate, không đọc được config async
    // ⇒ chỉnh trực tiếp trên worker sau khi DI đã sẵn sàng.
    const { concurrency } = this.config.mediaUpload;
    this.worker.concurrency = concurrency;
    this.logger.log(
      `Worker "${MEDIA_UPLOAD_QUEUE}" sẵn sàng (concurrency=${concurrency})`,
    );
  }
}
