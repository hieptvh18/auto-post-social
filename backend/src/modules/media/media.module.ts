import { Module } from '@nestjs/common';
import { DriveModule } from '../../infra/drive/drive.module';
import { SettingsModule } from '../settings/settings.module';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';

@Module({
  imports: [DriveModule, SettingsModule],
  controllers: [MediaController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
