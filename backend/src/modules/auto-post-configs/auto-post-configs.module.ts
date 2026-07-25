import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { AutoPostConfigsController } from './auto-post-configs.controller';
import { AutoPostConfigsRepository } from './auto-post-configs.repository';
import { AutoPostConfigsService } from './auto-post-configs.service';
import { AutoPostSlotsController } from './auto-post-slots.controller';

/**
 * Chỉ CRUD cấu hình. Engine đăng tự động (cron picker + queue + publisher) là
 * module riêng ở plan 07 và sẽ dùng lại `AutoPostConfigsRepository.findDueSlots`.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AutoPostConfigsController, AutoPostSlotsController],
  providers: [AutoPostConfigsRepository, AutoPostConfigsService],
  exports: [AutoPostConfigsRepository],
})
export class AutoPostConfigsModule {}
