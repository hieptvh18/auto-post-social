import { Module } from '@nestjs/common';
import { CryptoModule } from '../../infra/crypto/crypto.module';
import { PrismaModule } from '../../infra/prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

/**
 * Cố ý KHÔNG khai controller ở đây: SettingsController cần DriveStorageFactory
 * (nút "Test kết nối"), mà DriveModule lại import SettingsModule ⇒ vòng lặp.
 * Controller nằm ở SettingsHttpModule, import cả hai.
 */
@Module({
  imports: [PrismaModule, CryptoModule, AuditModule],
  providers: [SettingsRepository, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
