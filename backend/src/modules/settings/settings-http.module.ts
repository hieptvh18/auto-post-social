import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { DriveOAuthController } from './drive-oauth.controller';
import { SettingsController } from './settings.controller';
import { SettingsModule } from './settings.module';

/**
 * Chỉ để gắn SettingsController — tách khỏi SettingsModule để phá vòng phụ thuộc
 * SettingsModule → DriveModule → SettingsModule (xem comment ở settings.module.ts).
 */
@Module({
  imports: [SettingsModule, MediaModule],
  controllers: [SettingsController, DriveOAuthController],
})
export class SettingsHttpModule {}
