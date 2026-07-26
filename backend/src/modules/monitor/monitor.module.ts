import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ClockModule } from '../../infra/clock/clock.module';
import { PublishJobsModule } from '../publish-jobs/publish-jobs.module';
import { PUBLISH_FACEBOOK_QUEUE } from '../publish-jobs/publish-queue.constants';
import { MonitorController } from './monitor.controller';
import { MonitorService } from './monitor.service';

/**
 * Giám sát hệ thống — CHỈ ĐỌC. Dùng lại `PublishJobsRepository` thay vì query
 * `publish_jobs` ở đây, để chỉ có một nơi viết Prisma cho bảng đó (rule 01).
 */
@Module({
  imports: [
    PublishJobsModule,
    ClockModule,
    BullModule.registerQueue({ name: PUBLISH_FACEBOOK_QUEUE }),
  ],
  controllers: [MonitorController],
  providers: [MonitorService],
  // Dashboard mượn để cảnh báo job kẹt — dùng chung một ngưỡng, một cách tính.
  exports: [MonitorService],
})
export class MonitorModule {}
