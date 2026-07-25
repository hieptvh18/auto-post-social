import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PublishExecutorService } from './publish-executor.service';
import {
  PUBLISH_FACEBOOK_QUEUE,
  PUBLISH_MAX_ATTEMPTS,
  type PublishFacebookJobData,
} from './publish-queue.constants';

/**
 * Worker đăng bài. Mọi nghiệp vụ nằm ở `PublishExecutorService` — ở đây chỉ quy
 * đổi thông tin retry của BullMQ (`attemptsMade`) thành tham số cho executor.
 */
@Processor(PUBLISH_FACEBOOK_QUEUE)
export class PublishFacebookProcessor extends WorkerHost {
  private readonly logger = new Logger(PublishFacebookProcessor.name);

  constructor(private readonly executor: PublishExecutorService) {
    super();
  }

  async process(job: Job<PublishFacebookJobData>): Promise<void> {
    const attemptNo = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? PUBLISH_MAX_ATTEMPTS;

    await this.executor.execute({
      publishJobId: job.data.publishJobId,
      attemptNo,
      isLastAttempt: attemptNo >= maxAttempts,
    });
    // Lỗi được executor ghi DB rồi ném lại — ném tiếp để BullMQ tính backoff.
  }

  onModuleInit(): void {
    this.logger.log(`Worker "${PUBLISH_FACEBOOK_QUEUE}" sẵn sàng`);
  }
}
