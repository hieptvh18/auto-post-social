import { DriveAuthMode } from '../../config/env.validation';

/** Khoá nhóm cấu hình trong bảng app_settings. */
export const SettingKey = {
  GOOGLE_DRIVE: 'google_drive',
  FACEBOOK_APP: 'facebook_app',
  /** Plan 28 — API key YouTube Data API v3 cho tính năng reup. */
  YOUTUBE_API: 'youtube_api',
  /** Plan 30 — cấu hình cron dọn dung lượng video reup đã đăng. */
  REUP_CLEANUP: 'reup_cleanup',
  /** Plan 32 — giờ chạy cron reup (quét + dọn dẹp), đổi được từ UI. */
  REUP_SCHEDULE: 'reup_schedule',
} as const;

export type SettingKeyValue = (typeof SettingKey)[keyof typeof SettingKey];

/**
 * Giá trị lưu trong app_settings['google_drive'].
 * Các field `*Enc` là ciphertext AES-256-GCM — KHÔNG bao giờ ra khỏi service.
 */
export interface DriveSettingsValue {
  authMode: DriveAuthMode;
  folderId: string | null;
  // authMode = service_account
  serviceAccountJsonEnc: string | null;
  // authMode = oauth2
  oauthClientId: string | null;
  oauthClientSecretEnc: string | null;
  oauthRefreshTokenEnc: string | null;
  oauthAccountEmail: string | null;
  maxUploadMb: number;
}

/** Config đã giải mã, dùng nội bộ để dựng Drive client. */
export interface ResolvedDriveConfig {
  authMode: DriveAuthMode;
  folderId: string | null;
  maxUploadMb: number;
  serviceAccountJson: string | null;
  /** Chỉ có khi authMode = oauth2 và đã kết nối. */
  oauth: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
  } | null;
  /** Tăng mỗi lần config đổi — factory dựa vào đây để dựng lại client. */
  version: number;
}

/**
 * Giá trị lưu trong app_settings['facebook_app'] (plan 15).
 * Dùng cho OAuth "Đăng nhập bằng Facebook" — không liên quan tới Page token.
 */
export interface FacebookAppSettingsValue {
  appId: string | null;
  appSecretEnc: string | null;
}

/** Bản trả ra API — secret chỉ còn là cờ `hasAppSecret`. */
export interface FacebookAppSettingsResponse {
  appId: string | null;
  hasAppSecret: boolean;
  /** Chuỗi phải khai trong Meta app → Facebook Login → Valid OAuth Redirect URIs. */
  redirectUri: string;
  /** true = đang chạy bằng giá trị .env vì DB chưa có bản ghi. */
  usingEnvFallback: boolean;
  updatedAt: Date | null;
}

/** Bản trả ra API — đã mask secret (rule 01 §Bảo mật). */
export interface DriveSettingsResponse {
  authMode: DriveAuthMode;
  folderId: string | null;
  maxUploadMb: number;
  // service_account
  hasServiceAccount: boolean;
  serviceAccountEmail: string | null;
  // oauth2
  hasOauthClient: boolean;
  oauthConnected: boolean;
  oauthAccountEmail: string | null;
  /** true = đang chạy bằng giá trị .env vì DB chưa có bản ghi. */
  usingEnvFallback: boolean;
  updatedAt: Date | null;
}

/**
 * Giá trị lưu trong app_settings['youtube_api'] (plan 28 §3.3).
 *
 * Theo ADR-014: credential sửa được từ UI, không phải restart app. Khác với
 * `REUP_PYTHON_BIN`/`REUP_PROJECT_DIR` — hai cái đó chỉ là **đường dẫn**, không
 * phải secret, nên ở `.env`.
 */
export interface YoutubeApiSettingsValue {
  /** AES-256-GCM. Chỉ giải mã đúng lúc spawn process con. */
  apiKeyEnc: string | null;
  /** Trần quota Data API v3 mỗi ngày. Mặc định 10.000 (hạn mặc định của Google). */
  dailyQuota: number;
}

/** Bản trả ra API — key đã mask, chỉ còn 4 ký tự cuối (rule 01 §Bảo mật). */
export interface YoutubeApiSettingsResponse {
  hasApiKey: boolean;
  /** Dạng `••••abcd`; `null` khi chưa cấu hình. */
  maskedApiKey: string | null;
  dailyQuota: number;
  /** true = đang chạy bằng key trong `.env` vì DB chưa có bản ghi (ADR-014). */
  usingEnvFallback: boolean;
  updatedAt: Date | null;
}

/**
 * Giá trị lưu trong app_settings['reup_cleanup'] (plan 30 §3.3).
 *
 * `enabled = false` mặc định là CỐ Ý — tính năng xoá dữ liệu không tự bật ở
 * lần deploy đầu, người vận hành phải xem preview rồi mới bật tay.
 */
export interface ReupCleanupSettingsValue {
  enabled: boolean;
  /** Số ngày kể từ lúc đăng thì được xoá file. Chặn 1..365 ở DTO. */
  retentionDays: number;
}

export interface ReupCleanupSettingsResponse {
  enabled: boolean;
  retentionDays: number;
  updatedAt: Date | null;
}

/**
 * Giá trị lưu trong app_settings['reup_schedule'] (plan 32 §3.1).
 *
 * Ranh giới với `REUP_CLEANUP`: key này trả lời "cron chạy LÚC NÀO", key kia trả
 * lời "lượt dọn xoá CÁI GÌ" (`retentionDays`). Gộp `cleanupTime` vào đây chứ
 * không tách key thứ ba để lịch của cả hai cron nằm chung một chỗ — đọc một bản
 * ghi là biết toàn bộ lịch reup.
 *
 * `cleanupEnabled` cố ý KHÔNG trùng `ReupCleanupSettingsValue.enabled`: cái kia
 * là công tắc nghiệp vụ "có được phép xoá file không" (mặc định false, người vận
 * hành bật tay sau khi xem preview), cái này chỉ là "có đăng ký cron theo lịch
 * không". Tắt cron mà vẫn giữ enabled ⇒ nút "Dọn ngay" vẫn dùng được.
 */
export interface ReupScheduleSettingsValue {
  discoveryEnabled: boolean;
  /** 'HH:mm' theo Asia/Ho_Chi_Minh — cùng quy ước `auto_post_slots.time`. */
  discoveryTime: string;
  cleanupEnabled: boolean;
  cleanupTime: string;
}

export interface ReupScheduleSettingsResponse extends ReupScheduleSettingsValue {
  /**
   * Giờ chạy kế tiếp thật của từng cron, đọc từ `CronJob.nextDate()` — đây là
   * bằng chứng cấu hình ĐÃ có hiệu lực, không phải chỉ mới ghi vào DB.
   * `null` = cron đang tắt.
   */
  discoveryNextRunAt: Date | null;
  cleanupNextRunAt: Date | null;
  updatedAt: Date | null;
}
