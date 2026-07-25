import { Module } from '@nestjs/common';
import { ClockModule } from '../../infra/clock/clock.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ContentPickerModule } from '../auto-post/content-picker.module';
import { SlotRunModule } from '../auto-post/slot-run.module';
import { AutoPostConfigsController } from './auto-post-configs.controller';
import { AutoPostConfigsRepository } from './auto-post-configs.repository';
import { AutoPostConfigsService } from './auto-post-configs.service';
import { AutoPostSlotsController } from './auto-post-slots.controller';

/**
 * Chỉ CRUD cấu hình. Engine đăng tự động (cron picker + queue + publisher) là
 * module riêng ở plan 07 và sẽ dùng lại `AutoPostConfigsRepository.findDueSlots`.
 */
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    ClockModule,
    // Đọc tình trạng kho + nhật ký cron để cảnh báo "hết bài" ngay trên trang cấu hình.
    ContentPickerModule,
    SlotRunModule,
  ],
  controllers: [AutoPostConfigsController, AutoPostSlotsController],
  providers: [AutoPostConfigsRepository, AutoPostConfigsService],
  exports: [AutoPostConfigsRepository],
})
export class AutoPostConfigsModule {}
