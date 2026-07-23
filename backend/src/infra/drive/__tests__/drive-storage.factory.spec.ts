import { BadRequestException } from '@nestjs/common';
import { DriverMode } from '../../../config/env.validation';
import type { SettingsService } from '../../../modules/settings/settings.service';
import type { ResolvedDriveConfig } from '../../../modules/settings/settings.types';
import { DriveStorageFactory } from '../drive-storage.factory';
import { FakeDriveStorage } from '../fake-drive.storage';
import { GoogleDriveStorage } from '../google-drive.storage';

const SA_JSON = JSON.stringify({
  type: 'service_account',
  client_email: 'sa@project.iam',
  private_key: 'key',
});

const config = (
  overrides: Partial<ResolvedDriveConfig> = {},
): ResolvedDriveConfig => ({
  driver: DriverMode.fake,
  folderId: null,
  serviceAccountJson: null,
  maxUploadMb: 200,
  version: 0,
  ...overrides,
});

describe('DriveStorageFactory', () => {
  let settingsService: { getDriveConfig: jest.Mock };
  let factory: DriveStorageFactory;

  beforeEach(() => {
    settingsService = { getDriveConfig: jest.fn() };
    factory = new DriveStorageFactory(
      settingsService as unknown as SettingsService,
    );
  });

  describe('get', () => {
    it('trả FakeDriveStorage khi driver = fake', async () => {
      settingsService.getDriveConfig.mockResolvedValue(config());

      expect(await factory.get()).toBeInstanceOf(FakeDriveStorage);
    });

    it('trả GoogleDriveStorage khi driver = real và đủ cấu hình', async () => {
      settingsService.getDriveConfig.mockResolvedValue(
        config({
          driver: DriverMode.real,
          folderId: 'folder-1',
          serviceAccountJson: SA_JSON,
        }),
      );

      expect(await factory.get()).toBeInstanceOf(GoogleDriveStorage);
    });

    it('ném BadRequest khi driver = real mà thiếu service account', async () => {
      settingsService.getDriveConfig.mockResolvedValue(
        config({ driver: DriverMode.real, folderId: 'folder-1' }),
      );

      await expect(factory.get()).rejects.toThrow(BadRequestException);
    });

    it('ném BadRequest khi driver = real mà thiếu folderId', async () => {
      settingsService.getDriveConfig.mockResolvedValue(
        config({ driver: DriverMode.real, serviceAccountJson: SA_JSON }),
      );

      await expect(factory.get()).rejects.toThrow(BadRequestException);
    });

    it('tái dùng instance cũ khi version không đổi', async () => {
      settingsService.getDriveConfig.mockResolvedValue(config());

      expect(await factory.get()).toBe(await factory.get());
    });

    it('dựng lại storage khi version đổi — đổi config không cần restart', async () => {
      settingsService.getDriveConfig.mockResolvedValueOnce(config());
      const first = await factory.get();

      settingsService.getDriveConfig.mockResolvedValueOnce(
        config({ version: 1 }),
      );
      const second = await factory.get();

      expect(second).not.toBe(first);
    });
  });
});
