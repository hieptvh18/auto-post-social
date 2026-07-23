import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { MediaType } from '../../../../generated/prisma/client';
import { DriverMode } from '../../../config/env.validation';
import type { DriveStorageFactory } from '../../../infra/drive/drive-storage.factory';
import type {
  DriveFile,
  UploadFileInput,
} from '../../../infra/drive/drive-storage.interface';
import type { SettingsService } from '../../settings/settings.service';
import type { ResolvedDriveConfig } from '../../settings/settings.types';
import { MediaService } from '../media.service';

const driveConfig = (
  overrides: Partial<ResolvedDriveConfig> = {},
): ResolvedDriveConfig => ({
  driver: DriverMode.fake,
  folderId: null,
  serviceAccountJson: null,
  maxUploadMb: 10,
  version: 0,
  ...overrides,
});

const uploaded = (overrides: Partial<DriveFile> = {}): DriveFile => ({
  fileId: 'drive-1',
  name: 'clip.mp4',
  mimeType: 'video/mp4',
  size: 1234,
  webViewLink: 'https://view',
  thumbnailLink: 'https://thumb',
  ...overrides,
});

const input = (overrides: Partial<UploadFileInput> = {}): UploadFileInput => ({
  filename: 'clip.mp4',
  mimeType: 'video/mp4',
  buffer: Buffer.from('bytes'),
  ...overrides,
});

describe('MediaService', () => {
  let storage: {
    upload: jest.Mock;
    createReadStream: jest.Mock;
    delete: jest.Mock;
  };
  let driveFactory: { get: jest.Mock };
  let settingsService: { getDriveConfig: jest.Mock };
  let service: MediaService;

  beforeEach(() => {
    storage = {
      upload: jest.fn().mockResolvedValue(uploaded()),
      createReadStream: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    driveFactory = { get: jest.fn().mockResolvedValue(storage) };
    settingsService = {
      getDriveConfig: jest.fn().mockResolvedValue(driveConfig()),
    };

    service = new MediaService(
      driveFactory as unknown as DriveStorageFactory,
      settingsService as unknown as SettingsService,
    );
  });

  describe('upload', () => {
    it('upload video hợp lệ và trả metadata với mediaType = video', async () => {
      const result = await service.upload(input());

      expect(storage.upload).toHaveBeenCalledWith(input());
      expect(result).toEqual({
        fileId: 'drive-1',
        driveUrl: 'https://view',
        thumbnailUrl: 'https://thumb',
        mimeType: 'video/mp4',
        size: 1234,
        mediaType: MediaType.video,
      });
    });

    it.each(['image/jpeg', 'image/png', 'image/webp'])(
      'suy ra mediaType = image cho mime %s',
      async (mimeType) => {
        storage.upload.mockResolvedValue(uploaded({ mimeType }));

        const result = await service.upload(input({ mimeType }));

        expect(result.mediaType).toBe(MediaType.image);
      },
    );

    it('suy ra mediaType = video cho video/quicktime', async () => {
      const result = await service.upload(
        input({ mimeType: 'video/quicktime' }),
      );

      expect(result.mediaType).toBe(MediaType.video);
    });

    it('ném BadRequest với mime không nằm trong whitelist', async () => {
      await expect(
        service.upload(input({ mimeType: 'application/x-msdownload' })),
      ).rejects.toThrow(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('ném BadRequest khi file vượt maxUploadMb (đọc từ cấu hình động)', async () => {
      settingsService.getDriveConfig.mockResolvedValue(
        driveConfig({ maxUploadMb: 1 }),
      );

      await expect(
        service.upload(input({ buffer: Buffer.alloc(2 * 1024 * 1024) })),
      ).rejects.toThrow(/vượt giới hạn 1MB/);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('cho phép file đúng bằng giới hạn', async () => {
      settingsService.getDriveConfig.mockResolvedValue(
        driveConfig({ maxUploadMb: 1 }),
      );

      await expect(
        service.upload(input({ buffer: Buffer.alloc(1024 * 1024) })),
      ).resolves.toBeDefined();
    });

    it('trả null khi Drive không có webViewLink/thumbnailLink', async () => {
      storage.upload.mockResolvedValue(
        uploaded({ webViewLink: null, thumbnailLink: null }),
      );

      const result = await service.upload(input());

      expect(result.driveUrl).toBeNull();
      expect(result.thumbnailUrl).toBeNull();
    });

    it('để lỗi domain từ Drive nổi lên nguyên vẹn', async () => {
      storage.upload.mockRejectedValue(new BadGatewayException('Drive lỗi'));

      await expect(service.upload(input())).rejects.toThrow(
        BadGatewayException,
      );
    });
  });

  describe('testConnection', () => {
    it('upload file thử rồi xoá đi, trả ok', async () => {
      const result = await service.testConnection();

      expect(storage.upload).toHaveBeenCalledWith(
        expect.objectContaining({ mimeType: 'text/plain' }),
      );
      expect(storage.delete).toHaveBeenCalledWith('drive-1');
      expect(result.ok).toBe(true);
      expect(result.driver).toBe(DriverMode.fake);
      expect(result.message).toContain('thành công');
    });

    it('để lỗi Drive nổi lên để UI báo cấu hình sai', async () => {
      storage.upload.mockRejectedValue(
        new BadGatewayException('share folder cho service account'),
      );

      await expect(service.testConnection()).rejects.toThrow(
        BadGatewayException,
      );
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });
});
