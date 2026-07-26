import { Module } from '@nestjs/common';
import { ClockModule } from '../../infra/clock/clock.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AutoPostConfigsModule } from '../auto-post-configs/auto-post-configs.module';
import { SlotRunModule } from '../auto-post/slot-run.module';
import { MonitorModule } from '../monitor/monitor.module';
import { DashboardController } from './dashboard.controller';
import { DashboardRepository } from './dashboard.repository';
import { DashboardService } from './dashboard.service';

/**
 * Màn "Tổng quan" — **chỉ đọc**, và **không module nào import ngược lại nó**.
 * Chiều phụ thuộc một chiều như vậy nên khối "Cần chú ý" mượn được
 * `MonitorService` / `AutoPostConfigsService` mà không tạo vòng (bài học
 * `SettingsHttpModule` và `AuditHttpModule`, contexts §7).
 */
@Module({
  imports: [
    PrismaModule,
    ClockModule,
    MonitorModule,
    AutoPostConfigsModule,
    SlotRunModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardRepository, DashboardService],
})
export class DashboardModule {}
