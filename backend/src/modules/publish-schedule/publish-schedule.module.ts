import { Module } from '@nestjs/common';
import { ClockModule } from '../../infra/clock/clock.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AutoPostConfigsModule } from '../auto-post-configs/auto-post-configs.module';
import { PublishScheduleController } from './publish-schedule.controller';
import { PublishScheduleRepository } from './publish-schedule.repository';
import { PublishScheduleService } from './publish-schedule.service';

/**
 * Màn "Lịch đăng bài" — chỉ đọc. Dùng lại `AutoPostConfigsRepository` để lấy cấu
 * hình mốc giờ thay vì tự query `auto_post_slots` (một nguồn sự thật cho slot).
 */
@Module({
  imports: [PrismaModule, ClockModule, AutoPostConfigsModule],
  controllers: [PublishScheduleController],
  providers: [PublishScheduleRepository, PublishScheduleService],
})
export class PublishScheduleModule {}
