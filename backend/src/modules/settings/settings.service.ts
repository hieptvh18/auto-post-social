import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { AppSetting } from '../../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { DriveAuthMode } from '../../config/env.validation';
import { buildFacebookRedirectUri } from '../../common/utils/facebook-redirect.util';
import { CryptoService } from '../../infra/crypto/crypto.service';
import type { FacebookAppCredentials } from '../../infra/facebook/facebook-graph.interface';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UpdateDriveSettingsDto } from './dto/update-drive-settings.dto';
import type { UpdateFacebookAppSettingsDto } from './dto/update-facebook-app-settings.dto';
import { SettingsRepository } from './settings.repository';
import {
  SettingKey,
  type DriveSettingsResponse,
  type DriveSettingsValue,
  type FacebookAppSettingsResponse,
  type FacebookAppSettingsValue,
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
  private readonly logger = new Logger(SettingsService.name);
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
      // .env chỉ hỗ trợ service_account (bootstrap), chưa có oauth.
      return {
        authMode: DriveAuthMode.service_account,
        folderId: env.folderId ?? null,
        maxUploadMb: env.maxUploadMb,
        serviceAccountJson: env.serviceAccountJson ?? null,
        oauth: null,
        version: this.driveVersion,
      };
    }

    const value = this.parseDriveValue(record);

    // Chỉ giải mã field của authMode đang active — nhánh còn lại
    // (vd service account cũ còn sót lại sau khi đổi TOKEN_ENCRYPTION_KEY)
    // không được DriveStorageFactory dùng tới, không được phép làm hỏng request.
    return {
      authMode: value.authMode,
      folderId: value.folderId,
      maxUploadMb: value.maxUploadMb,
      serviceAccountJson:
        value.authMode === DriveAuthMode.service_account &&
        value.serviceAccountJsonEnc !== null
          ? this.crypto.decrypt(value.serviceAccountJsonEnc)
          : null,
      oauth:
        value.authMode === DriveAuthMode.oauth2
          ? this.resolveOauth(value)
          : null,
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
        authMode: DriveAuthMode.service_account,
        folderId: env.folderId ?? null,
        maxUploadMb: env.maxUploadMb,
        hasServiceAccount,
        serviceAccountEmail: hasServiceAccount
          ? this.extractClientEmail(env.serviceAccountJson as string)
          : null,
        hasOauthClient: false,
        oauthConnected: false,
        oauthAccountEmail: null,
        usingEnvFallback: true,
        updatedAt: null,
      };
    }

    const value = this.parseDriveValue(record);
    const enc = value.serviceAccountJsonEnc;

    return {
      authMode: value.authMode,
      folderId: value.folderId,
      maxUploadMb: value.maxUploadMb,
      hasServiceAccount: enc !== null,
      serviceAccountEmail: enc === null ? null : this.safeExtractEmail(enc),
      hasOauthClient:
        value.oauthClientId !== null && value.oauthClientSecretEnc !== null,
      oauthConnected: value.oauthRefreshTokenEnc !== null,
      oauthAccountEmail: value.oauthAccountEmail,
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

    // Không gửi secret = giữ nguyên cái đã lưu (UI không đổ secret cũ xuống client).
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

    // OAuth client id/secret: giữ nguyên nếu không gửi.
    const oauthClientId =
      dto.oauthClientId === undefined
        ? (current?.oauthClientId ?? null)
        : dto.oauthClientId;

    let oauthClientSecretEnc: string | null =
      current?.oauthClientSecretEnc ?? null;
    if (dto.oauthClientSecret !== undefined) {
      oauthClientSecretEnc =
        dto.oauthClientSecret === null
          ? null
          : this.crypto.encrypt(dto.oauthClientSecret);
    }

    // Đổi client id hoặc secret ⇒ refresh token cũ hết hiệu lực, buộc kết nối lại.
    const clientChanged =
      oauthClientId !== (current?.oauthClientId ?? null) ||
      (dto.oauthClientSecret !== undefined && dto.oauthClientSecret !== null);
    let oauthRefreshTokenEnc: string | null =
      current?.oauthRefreshTokenEnc ?? null;
    let oauthAccountEmail: string | null = current?.oauthAccountEmail ?? null;
    if (clientChanged) {
      oauthRefreshTokenEnc = null;
      oauthAccountEmail = null;
    }

    this.assertModeConfigured(dto.authMode, {
      folderId,
      serviceAccountJsonEnc,
      oauthClientId,
      oauthClientSecretEnc,
    });

    const value: DriveSettingsValue = {
      authMode: dto.authMode,
      folderId,
      serviceAccountJsonEnc,
      oauthClientId,
      oauthClientSecretEnc,
      oauthRefreshTokenEnc,
      oauthAccountEmail,
      maxUploadMb: dto.maxUploadMb,
    };

    await this.persist(value, actorId, current);
    return this.getDriveSettings();
  }

  /** Lấy client OAuth đã giải mã cho DriveOAuthService (build URL / đổi code). */
  async getOauthClientCredentials(): Promise<{
    clientId: string;
    clientSecret: string;
  }> {
    const record = await this.repository.findByKey(SettingKey.GOOGLE_DRIVE);
    const value = record === null ? null : this.parseDriveValue(record);
    if (
      value === null ||
      value.oauthClientId === null ||
      value.oauthClientSecretEnc === null
    ) {
      throw new BadRequestException(
        'Chưa nhập OAuth Client ID/Secret. Lưu cấu hình OAuth trước khi kết nối Google.',
      );
    }
    return {
      clientId: value.oauthClientId,
      clientSecret: this.crypto.decrypt(value.oauthClientSecretEnc),
    };
  }

  /** Lưu refresh token + email tài khoản sau khi OAuth callback thành công. */
  async saveOauthTokens(
    refreshToken: string,
    accountEmail: string | null,
    actorId: string,
  ): Promise<void> {
    const record = await this.repository.findByKey(SettingKey.GOOGLE_DRIVE);
    if (record === null) {
      throw new BadRequestException(
        'Chưa có cấu hình Drive để lưu OAuth token.',
      );
    }
    const current = this.parseDriveValue(record);
    const value: DriveSettingsValue = {
      ...current,
      oauthRefreshTokenEnc: this.crypto.encrypt(refreshToken),
      oauthAccountEmail: accountEmail,
    };
    await this.persist(value, actorId, current);
  }

  // ─────────────────────────── Facebook App (plan 15) ───────────────────────────

  /** Bản cho API — chỉ nói "đã có secret hay chưa", không bao giờ trả secret. */
  async getFacebookAppSettings(): Promise<FacebookAppSettingsResponse> {
    const record = await this.repository.findByKey(SettingKey.FACEBOOK_APP);
    const redirectUri = this.facebookRedirectUri();

    if (record === null) {
      const env = this.config.facebook;
      return {
        appId: env.appId ?? null,
        hasAppSecret: env.appSecret !== undefined && env.appSecret !== '',
        redirectUri,
        usingEnvFallback: true,
        updatedAt: null,
      };
    }

    const value = this.parseFacebookAppValue(record);
    return {
      appId: value.appId,
      hasAppSecret: value.appSecretEnc !== null,
      redirectUri,
      usingEnvFallback: false,
      updatedAt: record.updatedAt,
    };
  }

  async updateFacebookAppSettings(
    dto: UpdateFacebookAppSettingsDto,
    actorId: string,
  ): Promise<FacebookAppSettingsResponse> {
    const existing = await this.repository.findByKey(SettingKey.FACEBOOK_APP);
    const current =
      existing === null ? null : this.parseFacebookAppValue(existing);

    // Không gửi secret = giữ nguyên cái đã lưu (UI không đổ secret cũ xuống client).
    let appSecretEnc: string | null = current?.appSecretEnc ?? null;
    if (dto.appSecret !== undefined) {
      appSecretEnc =
        dto.appSecret === null ? null : this.crypto.encrypt(dto.appSecret);
    }

    if (appSecretEnc === null) {
      throw new BadRequestException(
        'Cần nhập App Secret của Meta app thì mới đăng nhập Facebook được.',
      );
    }

    const value: FacebookAppSettingsValue = { appId: dto.appId, appSecretEnc };

    await this.repository.upsert(
      SettingKey.FACEBOOK_APP,
      { ...value },
      actorId,
    );
    await this.auditService.log({
      userId: actorId,
      action: AuditAction.SETTINGS_UPDATE,
      resource: `app_settings/${SettingKey.FACEBOOK_APP}`,
      // Chỉ ghi appId — appSecret tuyệt đối không vào audit log.
      beforeValue: current === null ? undefined : { appId: current.appId },
      afterValue: { appId: value.appId },
    });

    return this.getFacebookAppSettings();
  }

  /**
   * App credentials đã giải mã cho `FacebookConnectService`. KHÔNG expose qua controller.
   * Ưu tiên app_settings, chưa có thì fallback `.env` (ADR-014) để clone xong chạy được ngay.
   */
  async getFacebookAppCredentials(): Promise<FacebookAppCredentials> {
    const record = await this.repository.findByKey(SettingKey.FACEBOOK_APP);

    if (record !== null) {
      const value = this.parseFacebookAppValue(record);
      if (value.appId !== null && value.appSecretEnc !== null) {
        return {
          appId: value.appId,
          appSecret: this.crypto.decrypt(value.appSecretEnc),
        };
      }
    }

    const env = this.config.facebook;
    if (
      env.appId !== undefined &&
      env.appId !== '' &&
      env.appSecret !== undefined &&
      env.appSecret !== ''
    ) {
      return { appId: env.appId, appSecret: env.appSecret };
    }

    throw new BadRequestException(
      'Chưa khai báo Facebook App. Vào Cài đặt chung → Facebook App nhập App ID và App Secret trước khi kết nối.',
    );
  }

  /** Chuỗi phải dán vào Meta app — dựng ở một chỗ duy nhất (rule: Meta so khớp từng ký tự). */
  facebookRedirectUri(): string {
    return buildFacebookRedirectUri(
      this.config.appBaseUrl,
      this.config.apiPrefix,
    );
  }

  private parseFacebookAppValue(record: AppSetting): FacebookAppSettingsValue {
    const raw = record.value as Partial<FacebookAppSettingsValue> | null;
    if (raw === null || typeof raw !== 'object') {
      throw new BadRequestException(
        'Cấu hình Facebook App trong DB không hợp lệ',
      );
    }
    return {
      appId: raw.appId ?? null,
      appSecretEnc: raw.appSecretEnc ?? null,
    };
  }

  private async persist(
    value: DriveSettingsValue,
    actorId: string,
    current: DriveSettingsValue | null,
  ): Promise<void> {
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
      // Chỉ ghi field không nhạy cảm — cấm đưa secret/token vào audit log.
      beforeValue:
        current === null
          ? undefined
          : {
              authMode: current.authMode,
              folderId: current.folderId,
              maxUploadMb: current.maxUploadMb,
            },
      afterValue: {
        authMode: value.authMode,
        folderId: value.folderId,
        maxUploadMb: value.maxUploadMb,
      },
    });
  }

  /** Cấu hình phải đủ theo mode — chặn ngay, đừng để lỗi lúc upload. */
  private assertModeConfigured(
    authMode: DriveAuthMode,
    v: {
      folderId: string | null;
      serviceAccountJsonEnc: string | null;
      oauthClientId: string | null;
      oauthClientSecretEnc: string | null;
    },
  ): void {
    if (authMode === DriveAuthMode.service_account) {
      if (v.folderId === null || v.folderId === '') {
        throw new BadRequestException(
          'Cần nhập Folder ID (Shared Drive) khi dùng service account',
        );
      }
      if (v.serviceAccountJsonEnc === null) {
        throw new BadRequestException(
          'Cần nhập Service Account JSON khi dùng service account',
        );
      }
      return;
    }

    // oauth2: cần client id/secret để có thể "Kết nối Google" (refresh token lấy sau).
    if (v.oauthClientId === null || v.oauthClientSecretEnc === null) {
      throw new BadRequestException(
        'Cần nhập OAuth Client ID và Client Secret khi dùng chế độ OAuth2',
      );
    }
  }

  /** Dựng object oauth đã giải mã, chỉ khi đủ cả 3 mảnh. */
  private resolveOauth(
    value: DriveSettingsValue,
  ): ResolvedDriveConfig['oauth'] {
    if (
      value.oauthClientId === null ||
      value.oauthClientSecretEnc === null ||
      value.oauthRefreshTokenEnc === null
    ) {
      return null;
    }
    return {
      clientId: value.oauthClientId,
      clientSecret: this.crypto.decrypt(value.oauthClientSecretEnc),
      refreshToken: this.crypto.decrypt(value.oauthRefreshTokenEnc),
    };
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
      authMode: raw.authMode ?? DriveAuthMode.service_account,
      folderId: raw.folderId ?? null,
      serviceAccountJsonEnc: raw.serviceAccountJsonEnc ?? null,
      oauthClientId: raw.oauthClientId ?? null,
      oauthClientSecretEnc: raw.oauthClientSecretEnc ?? null,
      oauthRefreshTokenEnc: raw.oauthRefreshTokenEnc ?? null,
      oauthAccountEmail: raw.oauthAccountEmail ?? null,
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

  /**
   * Giải mã service account chỉ để hiển thị email — không được phép làm sập
   * cả trang cài đặt nếu ciphertext cũ còn sót lại từ trước khi đổi
   * TOKEN_ENCRYPTION_KEY (docs: đổi khoá ⇒ ciphertext cũ không giải mã được nữa).
   */
  private safeExtractEmail(enc: string): string | null {
    try {
      return this.extractClientEmail(this.crypto.decrypt(enc));
    } catch {
      this.logger.warn(
        'Không giải mã được Service Account JSON đã lưu (có thể do đổi TOKEN_ENCRYPTION_KEY) — bỏ qua serviceAccountEmail, cần nhập lại.',
      );
      return null;
    }
  }
}
