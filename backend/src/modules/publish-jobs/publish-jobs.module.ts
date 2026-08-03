import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { DriveModule } from '../../infra/drive/drive.module';
import { MediaCacheModule } from '../../infra/media-cache/media-cache.module';
import { FacebookModule } from '../../infra/facebook/facebook.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { FacebookPagesModule } from '../facebook-pages/facebook-pages.module';
import { PublishFacebookProcessor } from './publish-facebook.processor';
import { PublishExecutorService } from './publish-executor.service';
import { PublishJobEventsRepository } from './publish-job-events.repository';
import { PublishJobEventsService } from './publish-job-events.service';
import { PublishJobsController } from './publish-jobs.controller';
import { PublishJobsRepository } from './publish-jobs.repository';
import { PublishJobsService } from './publish-jobs.service';
import { PublishMediaService } from './publish-media.service';
import { PUBLISH_FACEBOOK_QUEUE } from './publish-queue.constants';

/**
 * Vòng đời một publish job: tạo → queue → worker đăng → ghi kết quả + nhật ký.
 * Module này **không** biết gì về cron/slot — đó là việc của `AutoPostModule`.
 */
@Module({
  imports: [
    PrismaModule,
    DriveModule,
    MediaCacheModule,
    FacebookModule,
    AuditModule,
    FacebookPagesModule,
    BullModule.registerQueue({ name: PUBLISH_FACEBOOK_QUEUE }),
  ],
  controllers: [PublishJobsController],
  providers: [
    PublishJobsRepository,
    PublishJobEventsRepository,
    PublishJobEventsService,
    PublishMediaService,
    PublishExecutorService,
    PublishJobsService,
    PublishFacebookProcessor,
  ],
  exports: [PublishJobsService, PublishMediaService, PublishJobsRepository],
})
export class PublishJobsModule {}
