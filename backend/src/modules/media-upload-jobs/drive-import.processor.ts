import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AppConfigService } from '../../config/app-config.service';
import { DriveImportsService } from './drive-imports.service';
import {
  DRIVE_IMPORT_QUEUE,
  MEDIA_UPLOAD_MAX_ATTEMPTS,
  type MediaUploadJobData,
} from './media-upload.constants';

/**
 * Worker copy file từ Drive khác về folder của tool (plan 24).
 *
 * Queue **riêng** với `media-upload`: một video 500MB đang chiếm hết slot của
 * worker kia không được phép chặn hàng chục lệnh copy vốn chỉ mất vài giây.
 */
@Processor(DRIVE_IMPORT_QUEUE)
export class DriveImportProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(DriveImportProcessor.name);

  constructor(
    private readonly service: DriveImportsService,
    private readonly config: AppConfigService,
  ) {
    super();
  }

  async process(job: Job<MediaUploadJobData>): Promise<void> {
    const attemptNo = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? MEDIA_UPLOAD_MAX_ATTEMPTS;

    await this.service.processImport({
      mediaUploadJobId: job.data.mediaUploadJobId,
      attemptNo,
      isLastAttempt: attemptNo >= maxAttempts,
    });
  }

  onModuleInit(): void {
    // `@Processor()` chỉ nhận hằng số lúc decorate ⇒ chỉnh sau khi DI sẵn sàng.
    const { concurrency } = this.config.driveImport;
    this.worker.concurrency = concurrency;
    this.logger.log(
      `Worker "${DRIVE_IMPORT_QUEUE}" sẵn sàng (concurrency=${concurrency})`,
    );
  }
}
