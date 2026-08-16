import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ReupDownloadService } from './reup-download.service';
import {
  REUP_DOWNLOAD_CONCURRENCY,
  REUP_DOWNLOAD_MAX_ATTEMPTS,
  REUP_DOWNLOAD_QUEUE,
  type ReupDownloadJobData,
} from './reup.constants';

/**
 * Worker tải video. Nghiệp vụ nằm ở `ReupDownloadService` — ở đây chỉ quy đổi
 * thông tin retry của BullMQ và đặt độ song song (cùng khuôn `MediaUploadProcessor`).
 */
@Processor(REUP_DOWNLOAD_QUEUE)
export class ReupDownloadProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(ReupDownloadProcessor.name);

  constructor(private readonly service: ReupDownloadService) {
    super();
  }

  async process(job: Job<ReupDownloadJobData>): Promise<void> {
    const attemptNo = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? REUP_DOWNLOAD_MAX_ATTEMPTS;

    await this.service.process({
      reupVideoId: job.data.reupVideoId,
      attemptNo,
      isLastAttempt: attemptNo >= maxAttempts,
    });
    // Lỗi đã được service ghi vào DB rồi ném lại — ném tiếp để BullMQ backoff.
  }

  onModuleInit(): void {
    this.worker.concurrency = REUP_DOWNLOAD_CONCURRENCY;
    this.logger.log(
      `Worker "${REUP_DOWNLOAD_QUEUE}" sẵn sàng (concurrency=${REUP_DOWNLOAD_CONCURRENCY})`,
    );
  }
}
