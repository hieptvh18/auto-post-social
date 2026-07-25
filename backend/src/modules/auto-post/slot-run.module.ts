import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { SlotRunRepository } from './slot-run.repository';
import { SlotRunService } from './slot-run.service';

/**
 * Nhật ký cron tách module riêng để trang cấu hình và màn lịch đọc được lần chạy
 * gần nhất mà không phải kéo cả engine (`AutoPostModule`) vào.
 */
@Module({
  imports: [PrismaModule],
  providers: [SlotRunRepository, SlotRunService],
  exports: [SlotRunService],
})
export class SlotRunModule {}
