import { Module } from '@nestjs/common';
import { ClockModule } from '../clock/clock.module';
import { DriveModule } from '../drive/drive.module';
import { MediaCacheService } from './media-cache.service';

@Module({
  imports: [DriveModule, ClockModule],
  providers: [MediaCacheService],
  exports: [MediaCacheService],
})
export class MediaCacheModule {}
