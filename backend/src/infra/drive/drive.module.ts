import { Module } from '@nestjs/common';
import { SettingsModule } from '../../modules/settings/settings.module';
import { DriveStorageFactory } from './drive-storage.factory';

@Module({
  imports: [SettingsModule],
  providers: [DriveStorageFactory],
  exports: [DriveStorageFactory],
})
export class DriveModule {}
