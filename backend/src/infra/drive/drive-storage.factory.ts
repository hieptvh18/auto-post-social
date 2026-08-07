import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DriveAuthMode } from '../../config/env.validation';
import { SettingsService } from '../../modules/settings/settings.service';
import type { ResolvedDriveConfig } from '../../modules/settings/settings.types';
import type {
  DriveFile,
  DriveFileMeta,
  DriveStorage,
  UploadFileInput,
} from './drive-storage.interface';
import { DriveAuthExpiredError } from './drive.errors';
import { createDriveClient, GoogleDriveStorage } from './google-drive.storage';
import type { Readable } from 'node:stream';

/**
 * Dựng DriveStorage theo cấu hình ĐỘNG trong DB (ADR-014).
 *
 * Không dùng provider factory một lần lúc bootstrap, vì như vậy đổi config ở màn
 * hình "Cài đặt chung" sẽ phải restart app. Thay vào đó cache client và dựng lại
 * khi `version` từ SettingsService đổi.
 */
/**
 * Bọc storage OAuth2: khi refresh token chết (`invalid_grant`), xoá token đã lưu
 * và bỏ client đang cache. Nếu không làm vậy thì UI vẫn hiện "đã kết nối" và mọi
 * request sau vẫn dùng lại đúng client hỏng cho tới khi restart app.
 */
class OauthAwareDriveStorage implements DriveStorage {
  constructor(
    private readonly inner: DriveStorage,
    private readonly onAuthExpired: (reason: string) => Promise<void>,
  ) {}

  upload(file: UploadFileInput): Promise<DriveFile> {
    return this.run(() => this.inner.upload(file));
  }

  createReadStream(fileId: string): Promise<Readable> {
    return this.run(() => this.inner.createReadStream(fileId));
  }

  delete(fileId: string): Promise<void> {
    return this.run(() => this.inner.delete(fileId));
  }

  getMetadata(fileId: string): Promise<DriveFileMeta> {
    return this.run(() => this.inner.getMetadata(fileId));
  }

  copy(fileId: string, name?: string): Promise<DriveFile> {
    return this.run(() => this.inner.copy(fileId, name));
  }

  private async run<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } catch (error) {
      if (error instanceof DriveAuthExpiredError) {
        await this.onAuthExpired(error.message);
      }
      throw error;
    }
  }
}

@Injectable()
export class DriveStorageFactory {
  private readonly logger = new Logger(DriveStorageFactory.name);
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

  /**
   * Dọn sau khi Google từ chối refresh token. Nuốt lỗi dọn dẹp — lỗi nghiệp vụ
   * (`DriveAuthExpiredError`) mới là thứ phải tới tay người dùng.
   */
  private async handleAuthExpired(reason: string): Promise<void> {
    this.cached = null;
    try {
      await this.settingsService.clearOauthTokens(reason);
    } catch (error) {
      this.logger.error(
        `Không xoá được refresh token Drive đã hỏng: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private build(config: ResolvedDriveConfig): DriveStorage {
    if (config.authMode === DriveAuthMode.oauth2) {
      if (config.oauth === null) {
        throw new BadRequestException(
          'Chưa kết nối Google (OAuth). Vào "Cài đặt chung" bấm "Kết nối Google".',
        );
      }
      // folderId null ⇒ upload vào My Drive gốc của user.
      const storage = new GoogleDriveStorage(
        createDriveClient({ mode: 'oauth2', ...config.oauth }),
        config.folderId ?? 'root',
      );
      return new OauthAwareDriveStorage(storage, (reason) =>
        this.handleAuthExpired(reason),
      );
    }

    if (config.serviceAccountJson === null || config.folderId === null) {
      throw new BadRequestException(
        'Chưa cấu hình Google Drive. Vào "Cài đặt chung" để nhập Service Account và Folder ID (Shared Drive).',
      );
    }

    return new GoogleDriveStorage(
      createDriveClient({
        mode: 'service_account',
        serviceAccountJson: config.serviceAccountJson,
      }),
      config.folderId,
    );
  }
}
