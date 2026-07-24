import type {
  DriveConnectionResult,
  DriveSettingsResponse,
  UpdateDriveSettingsBody,
} from '../types';
import { apiRequest } from './client';

export const settingsApi = {
  /** GET /settings/google-drive — cấu hình hiện tại, service account đã mask. */
  getDrive(): Promise<DriveSettingsResponse> {
    return apiRequest<DriveSettingsResponse>('/settings/google-drive');
  },

  /**
   * PUT /settings/google-drive — lưu cấu hình động (ADR-014).
   * KHÔNG gửi `serviceAccountJson` = backend giữ nguyên JSON đã lưu.
   */
  updateDrive(body: UpdateDriveSettingsBody): Promise<DriveSettingsResponse> {
    return apiRequest<DriveSettingsResponse>('/settings/google-drive', {
      method: 'PUT',
      body,
    });
  },

  /** POST /settings/google-drive/test — thử upload+xoá file thăm dò bằng config đang lưu. */
  testDrive(): Promise<DriveConnectionResult> {
    return apiRequest<DriveConnectionResult>('/settings/google-drive/test', {
      method: 'POST',
    });
  },

  /** GET /settings/google-drive/oauth/url — URL consent Google để kết nối OAuth2. */
  getOauthUrl(): Promise<{ url: string }> {
    return apiRequest<{ url: string }>('/settings/google-drive/oauth/url');
  },
};
