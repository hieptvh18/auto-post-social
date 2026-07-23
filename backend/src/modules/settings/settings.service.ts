import { BadRequestException, Injectable } from '@nestjs/common';
import type { AppSetting } from '../../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { DriverMode } from '../../config/env.validation';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UpdateDriveSettingsDto } from './dto/update-drive-settings.dto';
import { SettingsRepository } from './settings.repository';
import {
  SettingKey,
  type DriveSettingsResponse,
  type DriveSettingsValue,
  type ResolvedDriveConfig,
} from './settings.types';

/**
 * Đọc/ghi cấu hình động (ADR-014).
 *
 * Nguồn ưu tiên: bảng app_settings → không có thì fallback .env. Nhờ vậy app vẫn
 * chạy được ngay sau khi clone mà chưa ai vào màn hình "Cài đặt chung".
 *
 * `version` tăng mỗi lần ghi để DriveStorageFactory biết phải dựng lại client —
 * đổi config KHÔNG cần restart app.
 */
@Injectable()
export class SettingsService {
  private driveVersion = 0;

  constructor(
    private readonly repository: SettingsRepository,
    private readonly config: AppConfigService,
    private readonly crypto: CryptoService,
    private readonly auditService: AuditService,
  ) {}

  /** Config đã giải mã cho tầng infra. KHÔNG expose qua controller. */
  async getDriveConfig(): Promise<ResolvedDriveConfig> {
    const record = await this.repository.findByKey(SettingKey.GOOGLE_DRIVE);
    const env = this.config.drive;

    if (record === null) {
      return {
        driver: env.driver,
        folderId: env.folderId ?? null,
        serviceAccountJson: env.serviceAccountJson ?? null,
        maxUploadMb: env.maxUploadMb,
        version: this.driveVersion,
      };
    }

    const value = this.parseDriveValue(record);

    return {
      driver: value.driver,
      folderId: value.folderId,
      serviceAccountJson:
        value.serviceAccountJsonEnc === null
          ? null
          : this.crypto.decrypt(value.serviceAccountJsonEnc),
      maxUploadMb: value.maxUploadMb,
      version: this.driveVersion,
    };
  }

  /** Bản cho API — secret đã mask. */
  async getDriveSettings(): Promise<DriveSettingsResponse> {
    const record = await this.repository.findByKey(SettingKey.GOOGLE_DRIVE);

    if (record === null) {
      const env = this.config.drive;
      const hasServiceAccount =
        env.serviceAccountJson !== undefined && env.serviceAccountJson !== '';

      return {
        driver: env.driver,
        folderId: env.folderId ?? null,
        maxUploadMb: env.maxUploadMb,
        hasServiceAccount,
        serviceAccountEmail: hasServiceAccount
          ? this.extractClientEmail(env.serviceAccountJson as string)
          : null,
        usingEnvFallback: true,
        updatedAt: null,
      };
    }

    const value = this.parseDriveValue(record);
    const enc = value.serviceAccountJsonEnc;

    return {
      driver: value.driver,
      folderId: value.folderId,
      maxUploadMb: value.maxUploadMb,
      hasServiceAccount: enc !== null,
      serviceAccountEmail:
        enc === null ? null : this.extractClientEmail(this.crypto.decrypt(enc)),
      usingEnvFallback: false,
      updatedAt: record.updatedAt,
    };
  }

  async updateDriveSettings(
    dto: UpdateDriveSettingsDto,
    actorId: string,
  ): Promise<DriveSettingsResponse> {
    const existing = await this.repository.findByKey(SettingKey.GOOGLE_DRIVE);
    const current = existing === null ? null : this.parseDriveValue(existing);

    // Không gửi serviceAccountJson = giữ nguyên cái đã lưu. UI không đổ secret cũ
    // xuống client nên không thể gửi lại nguyên văn.
    let serviceAccountJsonEnc: string | null =
      current?.serviceAccountJsonEnc ?? null;
    if (dto.serviceAccountJson !== undefined) {
      serviceAccountJsonEnc =
        dto.serviceAccountJson === null
          ? null
          : this.crypto.encrypt(
              this.validateServiceAccount(dto.serviceAccountJson),
            );
    }

    const folderId =
      dto.folderId === undefined ? (current?.folderId ?? null) : dto.folderId;

    // Driver real mà thiếu cấu hình ⇒ chặn ngay, đừng để lỗi lúc upload.
    if (dto.driver === DriverMode.real) {
      if (folderId === null || folderId === '') {
        throw new BadRequestException(
          'Cần nhập Folder ID khi dùng driver "real"',
        );
      }
      if (serviceAccountJsonEnc === null) {
        throw new BadRequestException(
          'Cần nhập Service Account JSON khi dùng driver "real"',
        );
      }
    }

    const value: DriveSettingsValue = {
      driver: dto.driver,
      folderId,
      serviceAccountJsonEnc,
      maxUploadMb: dto.maxUploadMb,
    };

    await this.repository.upsert(
      SettingKey.GOOGLE_DRIVE,
      { ...value },
      actorId,
    );
    this.driveVersion += 1;

    await this.auditService.log({
      userId: actorId,
      action: AuditAction.SETTINGS_UPDATE,
      resource: `app_settings/${SettingKey.GOOGLE_DRIVE}`,
      // Chỉ ghi field không nhạy cảm — cấm đưa service account vào audit log.
      beforeValue:
        current === null
          ? undefined
          : {
              driver: current.driver,
              folderId: current.folderId,
              maxUploadMb: current.maxUploadMb,
            },
      afterValue: {
        driver: value.driver,
        folderId: value.folderId,
        maxUploadMb: value.maxUploadMb,
      },
    });

    return this.getDriveSettings();
  }

  private parseDriveValue(record: AppSetting): DriveSettingsValue {
    // value là Json của Prisma — narrow về object trước khi đọc field (cấm any).
    const raw = record.value as Partial<DriveSettingsValue> | null;
    if (raw === null || typeof raw !== 'object') {
      throw new BadRequestException(
        'Cấu hình Google Drive trong DB không hợp lệ',
      );
    }

    const env = this.config.drive;
    return {
      driver: raw.driver ?? env.driver,
      folderId: raw.folderId ?? null,
      serviceAccountJsonEnc: raw.serviceAccountJsonEnc ?? null,
      maxUploadMb: raw.maxUploadMb ?? env.maxUploadMb,
    };
  }

  /** JSON phải parse được và có client_email — bắt lỗi dán nhầm nội dung. */
  private validateServiceAccount(json: string): string {
    if (this.extractClientEmail(json) === null) {
      throw new BadRequestException(
        'Service Account JSON không hợp lệ — phải là JSON có trường "client_email"',
      );
    }
    return json;
  }

  private extractClientEmail(json: string): string | null {
    try {
      const parsed: unknown = JSON.parse(json);
      if (parsed === null || typeof parsed !== 'object') return null;
      const email = (parsed as { client_email?: unknown }).client_email;
      return typeof email === 'string' && email !== '' ? email : null;
    } catch {
      // Env có thể chứa đường dẫn file thay vì JSON — không phải lỗi, chỉ là không đọc được email.
      return null;
    }
  }
}
