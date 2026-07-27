import { DriveAuthMode } from '../../config/env.validation';

/** Khoá nhóm cấu hình trong bảng app_settings. */
export const SettingKey = {
  GOOGLE_DRIVE: 'google_drive',
  FACEBOOK_APP: 'facebook_app',
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
