import { Module } from '@nestjs/common';
import { ClockModule } from '../../infra/clock/clock.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AutoPostConfigsModule } from '../auto-post-configs/auto-post-configs.module';
import { PublishJobsModule } from '../publish-jobs/publish-jobs.module';
import { AutoPostEngineController } from './auto-post-engine.controller';
import { AutoPostSchedulerService } from './auto-post-scheduler.service';
import { ContentPickerModule } from './content-picker.module';
import { SlotRunModule } from './slot-run.module';

/**
 * Engine đăng tự động: cron mỗi phút → chọn bài → xếp hàng job (plan 07).
 * Cấu hình slot là module khác (`AutoPostConfigsModule`, plan 06); việc đăng
 * thật là module khác nữa (`PublishJobsModule`).
 */
@Module({
  imports: [
    PrismaModule,
    ClockModule,
    ContentPickerModule,
    SlotRunModule,
    AutoPostConfigsModule,
    PublishJobsModule,
  ],
  controllers: [AutoPostEngineController],
  providers: [AutoPostSchedulerService],
})
export class AutoPostModule {}
