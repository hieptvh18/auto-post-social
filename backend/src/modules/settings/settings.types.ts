import { DriverMode } from '../../config/env.validation';

/** Khoá nhóm cấu hình trong bảng app_settings. */
export const SettingKey = {
  GOOGLE_DRIVE: 'google_drive',
} as const;

export type SettingKeyValue = (typeof SettingKey)[keyof typeof SettingKey];

/**
 * Giá trị lưu trong app_settings['google_drive'].
 * `serviceAccountJsonEnc` là ciphertext AES-256-GCM — không bao giờ ra khỏi service.
 */
export interface DriveSettingsValue {
  driver: DriverMode;
  folderId: string | null;
  serviceAccountJsonEnc: string | null;
  maxUploadMb: number;
}

/** Config đã giải mã, dùng nội bộ để dựng Drive client. */
export interface ResolvedDriveConfig {
  driver: DriverMode;
  folderId: string | null;
  serviceAccountJson: string | null;
  maxUploadMb: number;
  /** Tăng mỗi lần config đổi — factory dựa vào đây để dựng lại client. */
  version: number;
}

/** Bản trả ra API — đã mask secret (rule 01 §Bảo mật). */
export interface DriveSettingsResponse {
  driver: DriverMode;
  folderId: string | null;
  maxUploadMb: number;
  /** Đã có service account trong DB hay chưa. */
  hasServiceAccount: boolean;
  /** Email service account trích từ JSON — để user biết cần share folder cho ai. */
  serviceAccountEmail: string | null;
  /** true = đang chạy bằng giá trị .env vì DB chưa có bản ghi. */
  usingEnvFallback: boolean;
  updatedAt: Date | null;
}
