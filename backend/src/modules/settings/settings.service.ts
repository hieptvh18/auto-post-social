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
import type { UpdateYoutubeApiSettingsDto } from './dto/update-youtube-api-settings.dto';
import { SettingsRepository } from './settings.repository';
import {
  SettingKey,
  type DriveSettingsResponse,
  type DriveSettingsValue,
  type FacebookAppSettingsResponse,
  type FacebookAppSettingsValue,
  type ReupCleanupSettingsResponse,
  type ReupCleanupSettingsValue,
  type ReupScheduleSettingsValue,
  type ResolvedDriveConfig,
  type YoutubeApiSettingsResponse,
  type YoutubeApiSettingsValue,
} from './settings.types';

/** Hạn mặc định Google cấp cho Data API v3 (`search.list` = 100 units/lần). */
const DEFAULT_YOUTUBE_DAILY_QUOTA = 10_000;

/** Plan 30 §3.3: mặc định tắt + 7 ngày — người vận hành tự bật sau khi xem preview. */
const DEFAULT_REUP_CLEANUP: ReupCleanupSettingsValue = {
  enabled: false,
  retentionDays: 7,
};

/** Plan 32 §3.1: giữ đúng giờ đang hardcode trước đây (02:00 quét, 03:00 dọn). */
const DEFAULT_REUP_SCHEDULE: ReupScheduleSettingsValue = {
  discoveryEnabled: true,
  discoveryTime: '02:00',
  cleanupEnabled: true,
  cleanupTime: '03:00',
};

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

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
          ? this.decryptSecret(
              value.serviceAccountJsonEnc,
              'Service Account JSON',
              'Vào Cài đặt chung → Google Drive dán lại Service Account JSON.',
            )
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

  /**
   * Email của tài khoản Drive đang kết nối — dùng cho câu lỗi "hãy chia sẻ file
   * cho email này" khi nhập bài từ link (plan 24 §0.4).
   *
   * Mượn lại `getDriveSettings()` (bản đã mask) thay vì tự giải mã: ở đây chỉ
   * cần **đúng một** field email, không được chạm tới phần còn lại của credential.
   */
  async getDriveAccountEmail(): Promise<string | null> {
    const settings = await this.getDriveSettings();
    return settings.authMode === DriveAuthMode.oauth2
      ? settings.oauthAccountEmail
      : settings.serviceAccountEmail;
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
      clientSecret: this.decryptSecret(
        value.oauthClientSecretEnc,
        'OAuth Client Secret của Google Drive',
        'Vào Cài đặt chung → Google Drive nhập lại Client Secret rồi bấm Lưu.',
      ),
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

  /**
   * Xoá refresh token đã lưu khi Google báo `invalid_grant` (token bị thu hồi /
   * hết hạn 7 ngày của app Testing). Gọi từ tầng infra, actor là hệ thống nên
   * `userId = null`.
   *
   * Không ném lỗi: đây là dọn dẹp phụ trợ, lỗi chính (upload hỏng) đã được ném rồi.
   */
  async clearOauthTokens(reason: string): Promise<void> {
    const record = await this.repository.findByKey(SettingKey.GOOGLE_DRIVE);
    if (record === null) return;

    const current = this.parseDriveValue(record);
    // Đã trống rồi thì không ghi lại — tránh bump version vô ích mỗi lần lỗi.
    if (current.oauthRefreshTokenEnc === null) return;

    this.logger.warn(
      `Xoá refresh token Google Drive đã lưu (tài khoản ${
        current.oauthAccountEmail ?? '?'
      }): ${reason}`,
    );

    await this.persist(
      { ...current, oauthRefreshTokenEnc: null, oauthAccountEmail: null },
      null,
      current,
    );
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
          // Cố tình KHÔNG rơi xuống fallback .env khi giải mã hỏng: appId lấy từ DB
          // mà appSecret lấy từ env là cặp lệch nhau ⇒ Meta trả lỗi khó hiểu hơn.
          appSecret: this.decryptSecret(
            value.appSecretEnc,
            'App Secret của Meta app',
            'Vào Cài đặt chung → Facebook App nhập lại App Secret rồi bấm Lưu.',
          ),
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

  // ─────────────────────────── YouTube API (plan 28) ───────────────────────────

  /** Bản cho API — key đã **mask**, chỉ còn 4 ký tự cuối (rule 01 §Bảo mật). */
  async getYoutubeApiSettings(): Promise<YoutubeApiSettingsResponse> {
    const record = await this.repository.findByKey(SettingKey.YOUTUBE_API);
    if (record === null) {
      // Chưa cấu hình ở UI ⇒ rơi về `.env` (ADR-014, cùng khuôn Drive/Facebook):
      // clone repo xong là chạy được ngay, chưa cần vào màn Reup nhập gì.
      const envKey = this.config.reup.youtubeApiKey;
      return {
        hasApiKey: envKey !== undefined,
        maskedApiKey: envKey === undefined ? null : `••••${envKey.slice(-4)}`,
        dailyQuota: DEFAULT_YOUTUBE_DAILY_QUOTA,
        usingEnvFallback: true,
        updatedAt: null,
      };
    }

    const value = this.parseYoutubeApiValue(record);
    // Có bản ghi nhưng key rỗng (người dùng xoá key) ⇒ vẫn rơi về env, giống hệt
    // cách Drive xử lý — nếu không thì xoá key ở UI là mất luôn đường chạy bằng env.
    const envKey = this.config.reup.youtubeApiKey;
    const usingEnvFallback = value.apiKeyEnc === null && envKey !== undefined;

    return {
      hasApiKey: value.apiKeyEnc !== null || envKey !== undefined,
      maskedApiKey: usingEnvFallback
        ? `••••${envKey.slice(-4)}`
        : this.maskYoutubeKey(value.apiKeyEnc),
      dailyQuota: value.dailyQuota,
      usingEnvFallback,
      updatedAt: record.updatedAt,
    };
  }

  async updateYoutubeApiSettings(
    dto: UpdateYoutubeApiSettingsDto,
    actorId: string,
  ): Promise<YoutubeApiSettingsResponse> {
    const existing = await this.repository.findByKey(SettingKey.YOUTUBE_API);
    const current =
      existing === null ? null : this.parseYoutubeApiValue(existing);

    // Không gửi `apiKey` = giữ nguyên key đã lưu (UI không đổ key cũ xuống client).
    let apiKeyEnc: string | null = current?.apiKeyEnc ?? null;
    if (dto.apiKey !== undefined) {
      apiKeyEnc =
        dto.apiKey === null || dto.apiKey.trim() === ''
          ? null
          : this.crypto.encrypt(dto.apiKey.trim());
    }

    const value: YoutubeApiSettingsValue = {
      apiKeyEnc,
      dailyQuota:
        dto.dailyQuota ?? current?.dailyQuota ?? DEFAULT_YOUTUBE_DAILY_QUOTA,
    };

    await this.repository.upsert(SettingKey.YOUTUBE_API, { ...value }, actorId);
    await this.auditService.log({
      userId: actorId,
      action: AuditAction.SETTINGS_UPDATE,
      resource: `app_settings/${SettingKey.YOUTUBE_API}`,
      // CHỈ ghi cờ có/không và quota — API key tuyệt đối không vào audit log.
      beforeValue:
        current === null
          ? undefined
          : {
              hasApiKey: current.apiKeyEnc !== null,
              dailyQuota: current.dailyQuota,
            },
      afterValue: {
        hasApiKey: value.apiKeyEnc !== null,
        dailyQuota: value.dailyQuota,
      },
    });

    return this.getYoutubeApiSettings();
  }

  /**
   * Key đã giải mã cho adapter downloader. **KHÔNG expose qua controller.**
   * Trả `null` = chưa cấu hình ⇒ adapter ném `YoutubeNotConfiguredError` và
   * plan 29 dịch thành `SKIPPED/NOT_CONFIGURED` (không spam log).
   */
  async getYoutubeApiKey(): Promise<string | null> {
    const record = await this.repository.findByKey(SettingKey.YOUTUBE_API);
    const value = record === null ? null : this.parseYoutubeApiValue(record);

    // DB thắng env (ADR-014): nhập key ở màn Reup là đè lên `.env`.
    if (value?.apiKeyEnc != null) {
      return this.decryptSecret(
        value.apiKeyEnc,
        'API key YouTube',
        'Vào màn Reup Setting → YouTube API để nhập lại.',
      );
    }

    return this.config.reup.youtubeApiKey ?? null;
  }

  /** Trần quota/ngày để cron chặn **trước khi** gọi API (plan 29 §3.2). */
  async getYoutubeDailyQuota(): Promise<number> {
    const record = await this.repository.findByKey(SettingKey.YOUTUBE_API);
    if (record === null) return DEFAULT_YOUTUBE_DAILY_QUOTA;
    return this.parseYoutubeApiValue(record).dailyQuota;
  }

  // ─────────────────────────── Reup cleanup (plan 30) ───────────────────────────

  async getReupCleanupSettings(): Promise<ReupCleanupSettingsResponse> {
    const record = await this.repository.findByKey(SettingKey.REUP_CLEANUP);
    if (record === null) {
      return { ...DEFAULT_REUP_CLEANUP, updatedAt: null };
    }
    const value = this.parseReupCleanupValue(record);
    return { ...value, updatedAt: record.updatedAt };
  }

  /** Trần ngày lưu trữ cho cron/preview/run — cùng nguồn sự thật với API. */
  async getReupCleanupConfig(): Promise<ReupCleanupSettingsValue> {
    const record = await this.repository.findByKey(SettingKey.REUP_CLEANUP);
    return record === null
      ? DEFAULT_REUP_CLEANUP
      : this.parseReupCleanupValue(record);
  }

  async updateReupCleanupSettings(
    input: ReupCleanupSettingsValue,
    actorId: string,
  ): Promise<ReupCleanupSettingsResponse> {
    const existing = await this.repository.findByKey(SettingKey.REUP_CLEANUP);
    const current =
      existing === null ? null : this.parseReupCleanupValue(existing);

    const value: ReupCleanupSettingsValue = {
      enabled: input.enabled,
      retentionDays: input.retentionDays,
    };

    await this.repository.upsert(
      SettingKey.REUP_CLEANUP,
      { ...value },
      actorId,
    );
    await this.auditService.log({
      userId: actorId,
      action: AuditAction.SETTINGS_UPDATE,
      resource: `app_settings/${SettingKey.REUP_CLEANUP}`,
      beforeValue: current === null ? undefined : { ...current },
      afterValue: { ...value },
    });

    return this.getReupCleanupSettings();
  }

  // ─────────────────────────── Reup schedule (plan 32) ───────────────────────────

  /**
   * Lịch chạy cron reup. **KHÔNG BAO GIỜ NÉM LỖI** (plan 32 §3.2 cạm bẫy 3 /
   * R3): hàm này được gọi trong `onModuleInit` của scheduler, ném ở đây là app
   * không boot được chỉ vì một bản ghi settings hỏng — trong khi reup chỉ là
   * tính năng phụ (QĐ-6). Bản ghi hỏng ⇒ log WARN + dùng mặc định 02:00/03:00.
   */
  async getReupScheduleConfig(): Promise<ReupScheduleSettingsValue> {
    try {
      const record = await this.repository.findByKey(SettingKey.REUP_SCHEDULE);
      if (record === null) return DEFAULT_REUP_SCHEDULE;
      return this.parseReupScheduleValue(record);
    } catch (error) {
      this.logger.warn(
        `Không đọc được lịch cron reup, dùng mặc định ${DEFAULT_REUP_SCHEDULE.discoveryTime}/${DEFAULT_REUP_SCHEDULE.cleanupTime}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return DEFAULT_REUP_SCHEDULE;
    }
  }

  async getReupScheduleUpdatedAt(): Promise<Date | null> {
    const record = await this.repository.findByKey(SettingKey.REUP_SCHEDULE);
    return record?.updatedAt ?? null;
  }

  async updateReupScheduleSettings(
    input: ReupScheduleSettingsValue,
    actorId: string,
  ): Promise<ReupScheduleSettingsValue> {
    this.assertValidScheduleTimes(input);

    const existing = await this.repository.findByKey(SettingKey.REUP_SCHEDULE);
    const current =
      existing === null ? null : this.parseReupScheduleValue(existing);

    const value: ReupScheduleSettingsValue = {
      discoveryEnabled: input.discoveryEnabled,
      discoveryTime: input.discoveryTime,
      cleanupEnabled: input.cleanupEnabled,
      cleanupTime: input.cleanupTime,
    };

    await this.repository.upsert(
      SettingKey.REUP_SCHEDULE,
      { ...value },
      actorId,
    );
    await this.auditService.log({
      userId: actorId,
      action: AuditAction.SETTINGS_UPDATE,
      resource: `app_settings/${SettingKey.REUP_SCHEDULE}`,
      beforeValue: current === null ? undefined : { ...current },
      afterValue: { ...value },
    });

    return value;
  }

  /**
   * Ràng buộc nghiệp vụ chéo field ⇒ kiểm ở service, không ở DTO (rule 01).
   * Hai cron trùng giờ là hỏng thật: lượt dọn có thể xoá file của đúng bài mà
   * lượt quét đang xử lý.
   */
  private assertValidScheduleTimes(value: ReupScheduleSettingsValue): void {
    if (!HHMM_PATTERN.test(value.discoveryTime)) {
      throw new BadRequestException(
        'Giờ quét video không hợp lệ — phải theo dạng HH:mm (00:00 đến 23:59)',
      );
    }
    if (!HHMM_PATTERN.test(value.cleanupTime)) {
      throw new BadRequestException(
        'Giờ dọn dẹp không hợp lệ — phải theo dạng HH:mm (00:00 đến 23:59)',
      );
    }
    if (value.discoveryTime === value.cleanupTime) {
      throw new BadRequestException(
        'Giờ quét video và giờ dọn dẹp không được trùng nhau — lượt dọn có thể xoá file của bài mà lượt quét đang xử lý. Hãy đặt cách nhau ít nhất 1 giờ.',
      );
    }
  }

  /** Field thiếu/sai kiểu ⇒ lấy mặc định cho riêng field đó, không ném (R3). */
  private parseReupScheduleValue(
    record: AppSetting,
  ): ReupScheduleSettingsValue {
    const raw = record.value as Partial<ReupScheduleSettingsValue> | null;
    if (raw === null || typeof raw !== 'object') {
      this.logger.warn(
        'Bản ghi lịch cron reup trong DB không đọc được — dùng mặc định.',
      );
      return DEFAULT_REUP_SCHEDULE;
    }
    return {
      discoveryEnabled:
        typeof raw.discoveryEnabled === 'boolean'
          ? raw.discoveryEnabled
          : DEFAULT_REUP_SCHEDULE.discoveryEnabled,
      discoveryTime: this.parseTimeOrDefault(
        raw.discoveryTime,
        DEFAULT_REUP_SCHEDULE.discoveryTime,
      ),
      cleanupEnabled:
        typeof raw.cleanupEnabled === 'boolean'
          ? raw.cleanupEnabled
          : DEFAULT_REUP_SCHEDULE.cleanupEnabled,
      cleanupTime: this.parseTimeOrDefault(
        raw.cleanupTime,
        DEFAULT_REUP_SCHEDULE.cleanupTime,
      ),
    };
  }

  private parseTimeOrDefault(raw: unknown, fallback: string): string {
    if (typeof raw === 'string' && HHMM_PATTERN.test(raw)) return raw;
    if (raw !== undefined) {
      const shown =
        typeof raw === 'string' || typeof raw === 'number'
          ? String(raw)
          : JSON.stringify(raw);
      this.logger.warn(
        `Giờ chạy cron reup trong DB không hợp lệ (${shown}) — dùng mặc định ${fallback}.`,
      );
    }
    return fallback;
  }

  private parseReupCleanupValue(record: AppSetting): ReupCleanupSettingsValue {
    const raw = record.value as Partial<ReupCleanupSettingsValue> | null;
    if (raw === null || typeof raw !== 'object') {
      throw new BadRequestException(
        'Cấu hình dọn dẹp reup trong DB không hợp lệ',
      );
    }
    return {
      enabled: raw.enabled ?? DEFAULT_REUP_CLEANUP.enabled,
      retentionDays: raw.retentionDays ?? DEFAULT_REUP_CLEANUP.retentionDays,
    };
  }

  private parseYoutubeApiValue(record: AppSetting): YoutubeApiSettingsValue {
    const raw = record.value as Partial<YoutubeApiSettingsValue> | null;
    if (raw === null || typeof raw !== 'object') {
      throw new BadRequestException(
        'Cấu hình YouTube API trong DB không hợp lệ',
      );
    }
    return {
      apiKeyEnc: raw.apiKeyEnc ?? null,
      dailyQuota: raw.dailyQuota ?? DEFAULT_YOUTUBE_DAILY_QUOTA,
    };
  }

  /**
   * `••••abcd` — 4 ký tự cuối, đúng khuôn đang dùng cho Page token.
   *
   * Giải mã hỏng (đổi `TOKEN_ENCRYPTION_KEY`) thì **không** ném lỗi ở đây: đây
   * là màn *xem* cấu hình, làm nó vỡ thì người dùng không vào được trang để sửa.
   */
  private maskYoutubeKey(apiKeyEnc: string | null): string | null {
    if (apiKeyEnc === null) return null;
    const plain = this.crypto.tryDecrypt(apiKeyEnc);
    if (plain === null) return '••••????';
    return `••••${plain.slice(-4)}`;
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

  /** `actorId = null` ⇒ hệ thống tự đổi (vd xoá token chết), không phải người dùng. */
  private async persist(
    value: DriveSettingsValue,
    actorId: string | null,
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
      clientSecret: this.decryptSecret(
        value.oauthClientSecretEnc,
        'OAuth Client Secret của Google Drive',
        'Vào Cài đặt chung → Google Drive nhập lại Client Secret rồi bấm Lưu.',
      ),
      refreshToken: this.decryptSecret(
        value.oauthRefreshTokenEnc,
        'Refresh token Google Drive',
        'Vào Cài đặt chung → Google Drive bấm "Kết nối lại" để cấp quyền lại.',
      ),
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
    const json = this.crypto.tryDecrypt(enc);
    if (json === null) {
      this.logger.warn(
        'Không giải mã được Service Account JSON đã lưu (có thể do đổi TOKEN_ENCRYPTION_KEY) — bỏ qua serviceAccountEmail, cần nhập lại.',
      );
      return null;
    }
    return this.extractClientEmail(json);
  }

  /**
   * Giải mã một secret **bắt buộc phải có** để thao tác chạy được.
   *
   * Ciphertext cũ sau khi đổi `TOKEN_ENCRYPTION_KEY` là lỗi cấu hình của người dùng
   * chứ không phải lỗi hệ thống ⇒ trả 400 kèm đúng chỗ cần nhập lại, thay vì để
   * `CryptoService.decrypt()` ném 500 với câu chung chung không biết sửa ở đâu.
   */
  private decryptSecret(enc: string, label: string, howToFix: string): string {
    const plain = this.crypto.tryDecrypt(enc);
    if (plain === null) {
      this.logger.warn(
        `Không giải mã được ${label} (khoá mã hoá đã thay đổi) — yêu cầu nhập lại.`,
      );
      throw new BadRequestException(
        `Không giải mã được ${label} đã lưu — khoá mã hoá (TOKEN_ENCRYPTION_KEY) đã thay đổi. ${howToFix}`,
      );
    }
    return plain;
  }
}
