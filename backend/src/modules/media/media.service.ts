import { BadRequestException, Injectable } from '@nestjs/common';
import { MediaType } from '../../../generated/prisma/client';
import { DriveStorageFactory } from '../../infra/drive/drive-storage.factory';
import type { UploadFileInput } from '../../infra/drive/drive-storage.interface';
import { SettingsService } from '../settings/settings.service';

export const ALLOWED_IMAGE_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const ALLOWED_VIDEO_MIMES = ['video/mp4', 'video/quicktime'] as const;

const BYTES_PER_MB = 1024 * 1024;

export interface UploadResult {
  fileId: string;
  driveUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string;
  size: number;
  mediaType: MediaType;
}

export interface DriveConnectionResult {
  ok: boolean;
  authMode: string;
  message: string;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly driveFactory: DriveStorageFactory,
    private readonly settingsService: SettingsService,
  ) {}

  async upload(file: UploadFileInput): Promise<UploadResult> {
    const mediaType = this.resolveMediaType(file.mimeType);

    // Giới hạn size đọc từ cấu hình ĐỘNG, không phải hằng số lúc build.
    const { maxUploadMb } = await this.settingsService.getDriveConfig();
    const maxBytes = maxUploadMb * BYTES_PER_MB;
    if (file.buffer.length > maxBytes) {
      throw new BadRequestException(
        `File vượt giới hạn ${maxUploadMb}MB (file hiện tại ${(
          file.buffer.length / BYTES_PER_MB
        ).toFixed(1)}MB)`,
      );
    }

    const storage = await this.driveFactory.get();
    const uploaded = await storage.upload(file);

    return {
      fileId: uploaded.fileId,
      driveUrl: uploaded.webViewLink,
      thumbnailUrl: uploaded.thumbnailLink,
      mimeType: uploaded.mimeType,
      size: uploaded.size,
      mediaType,
    };
  }

  /**
   * Kiểm tra cấu hình Drive hiện tại có dùng được không — cho nút "Test kết nối"
   * ở màn hình Cài đặt chung, để user phát hiện sai folder/quyền trước khi upload thật.
   */
  async testConnection(): Promise<DriveConnectionResult> {
    const config = await this.settingsService.getDriveConfig();
    const storage = await this.driveFactory.get();

    const probe = await storage.upload({
      filename: `connection-test-${Date.now()}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('tool-auto-fb connection test'),
    });
    // Dọn file thử ngay, không để rác trong folder người dùng.
    await storage.delete(probe.fileId);

    return {
      ok: true,
      authMode: config.authMode,
      message: `Kết nối thành công (authMode: ${config.authMode})`,
    };
  }

  /** Whitelist mime — suy ra mediaType, mime lạ ⇒ 400. */
  private resolveMediaType(mimeType: string): MediaType {
    if ((ALLOWED_IMAGE_MIMES as readonly string[]).includes(mimeType)) {
      return MediaType.image;
    }
    if ((ALLOWED_VIDEO_MIMES as readonly string[]).includes(mimeType)) {
      return MediaType.video;
    }

    throw new BadRequestException(
      `Định dạng "${mimeType}" không được hỗ trợ. Chỉ nhận: ${[
        ...ALLOWED_IMAGE_MIMES,
        ...ALLOWED_VIDEO_MIMES,
      ].join(', ')}`,
    );
  }
}
