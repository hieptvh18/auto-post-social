import { BadRequestException } from '@nestjs/common';
import { DriveAuthMode } from '../../../config/env.validation';
import type { SettingsService } from '../../../modules/settings/settings.service';
import type { ResolvedDriveConfig } from '../../../modules/settings/settings.types';
import { DriveStorageFactory } from '../drive-storage.factory';
import { DriveAuthExpiredError } from '../drive.errors';
import { GoogleDriveStorage } from '../google-drive.storage';

const SA_JSON = JSON.stringify({
  type: 'service_account',
  client_email: 'sa@project.iam',
  private_key: 'key',
});

const config = (
  overrides: Partial<ResolvedDriveConfig> = {},
): ResolvedDriveConfig => ({
  authMode: DriveAuthMode.service_account,
  folderId: 'folder-1',
  serviceAccountJson: SA_JSON,
  oauth: null,
  maxUploadMb: 200,
  version: 0,
  ...overrides,
});

const oauthConfig = (version = 0): ResolvedDriveConfig =>
  config({
    authMode: DriveAuthMode.oauth2,
    folderId: null,
    serviceAccountJson: null,
    oauth: {
      clientId: 'cid',
      clientSecret: 'csecret',
      refreshToken: 'rtoken',
    },
    version,
  });

describe('DriveStorageFactory', () => {
  let settingsService: {
    getDriveConfig: jest.Mock;
    clearOauthTokens: jest.Mock;
  };
  let factory: DriveStorageFactory;

  beforeEach(() => {
    settingsService = {
      getDriveConfig: jest.fn(),
      clearOauthTokens: jest.fn().mockResolvedValue(undefined),
    };
    factory = new DriveStorageFactory(
      settingsService as unknown as SettingsService,
    );
  });

  describe('get', () => {
    it('trả GoogleDriveStorage khi đủ cấu hình service account', async () => {
      settingsService.getDriveConfig.mockResolvedValue(config());

      expect(await factory.get()).toBeInstanceOf(GoogleDriveStorage);
    });

    it('ném BadRequest khi thiếu service account', async () => {
      settingsService.getDriveConfig.mockResolvedValue(
        config({ serviceAccountJson: null }),
      );

      await expect(factory.get()).rejects.toThrow(BadRequestException);
    });

    it('ném BadRequest khi thiếu folderId', async () => {
      settingsService.getDriveConfig.mockResolvedValue(
        config({ folderId: null }),
      );

      await expect(factory.get()).rejects.toThrow(BadRequestException);
    });

    it('trả storage dùng được khi authMode = oauth2 và đã kết nối', async () => {
      settingsService.getDriveConfig.mockResolvedValue(oauthConfig());

      const storage = await factory.get();

      // Bọc trong OauthAwareDriveStorage nên không còn là GoogleDriveStorage trần.
      expect(typeof storage.upload).toBe('function');
    });

    it('ném BadRequest khi authMode = oauth2 mà chưa kết nối (oauth null)', async () => {
      settingsService.getDriveConfig.mockResolvedValue(
        config({
          authMode: DriveAuthMode.oauth2,
          oauth: null,
        }),
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

  describe('khi refresh token OAuth chết (invalid_grant)', () => {
    const upload = () =>
      factory
        .get()
        .then((storage) =>
          storage.upload({ filename: 'a.jpg', mimeType: 'image/jpeg', buffer }),
        );
    const buffer = Buffer.from('x');

    beforeEach(() => {
      settingsService.getDriveConfig.mockResolvedValue(oauthConfig());
      jest
        .spyOn(GoogleDriveStorage.prototype, 'upload')
        .mockRejectedValue(new DriveAuthExpiredError());
    });

    afterEach(() => jest.restoreAllMocks());

    it('vẫn ném lỗi ra ngoài để người dùng biết phải kết nối lại', async () => {
      await expect(upload()).rejects.toThrow(DriveAuthExpiredError);
    });

    it('xoá refresh token đã lưu trong settings', async () => {
      await expect(upload()).rejects.toThrow(DriveAuthExpiredError);

      expect(settingsService.clearOauthTokens).toHaveBeenCalledWith(
        expect.stringContaining('invalid_grant'),
      );
    });

    it('bỏ client đang cache để lần sau dựng lại', async () => {
      const before = await factory.get();
      await expect(upload()).rejects.toThrow(DriveAuthExpiredError);

      expect(await factory.get()).not.toBe(before);
    });

    it('không nuốt lỗi gốc khi việc xoá token cũng hỏng', async () => {
      settingsService.clearOauthTokens.mockRejectedValue(new Error('db down'));

      await expect(upload()).rejects.toThrow(DriveAuthExpiredError);
    });
  });
});
