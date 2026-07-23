import { BadRequestException, Injectable } from '@nestjs/common';
import { DriverMode } from '../../config/env.validation';
import { SettingsService } from '../../modules/settings/settings.service';
import type { ResolvedDriveConfig } from '../../modules/settings/settings.types';
import type { DriveStorage } from './drive-storage.interface';
import { FakeDriveStorage } from './fake-drive.storage';
import { createDriveClient, GoogleDriveStorage } from './google-drive.storage';

/**
 * Dựng DriveStorage theo cấu hình ĐỘNG trong DB (ADR-014).
 *
 * Không dùng provider factory một lần lúc bootstrap, vì như vậy đổi config ở màn
 * hình "Cài đặt chung" sẽ phải restart app. Thay vào đó cache client và dựng lại
 * khi `version` từ SettingsService đổi.
 */
@Injectable()
export class DriveStorageFactory {
  private cached: { version: number; storage: DriveStorage } | null = null;

  constructor(private readonly settingsService: SettingsService) {}

  async get(): Promise<DriveStorage> {
    const config = await this.settingsService.getDriveConfig();

    if (this.cached !== null && this.cached.version === config.version) {
      return this.cached.storage;
    }

    const storage = this.build(config);
    this.cached = { version: config.version, storage };
    return storage;
  }

  private build(config: ResolvedDriveConfig): DriveStorage {
    if (config.driver === DriverMode.fake) {
      return new FakeDriveStorage();
    }

    if (config.serviceAccountJson === null || config.folderId === null) {
      throw new BadRequestException(
        'Chưa cấu hình Google Drive. Vào "Cài đặt chung" để nhập Service Account và Folder ID.',
      );
    }

    return new GoogleDriveStorage(
      createDriveClient({
        serviceAccountJson: config.serviceAccountJson,
        folderId: config.folderId,
      }),
      config.folderId,
    );
  }
}
