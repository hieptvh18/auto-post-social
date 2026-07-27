import type {
  DriveConnectionResult,
  DriveSettingsResponse,
  FacebookAppSettingsResponse,
  UpdateDriveSettingsBody,
  UpdateFacebookAppSettingsBody,
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

  /** GET /settings/facebook-app — App ID + redirect URI phải khai ở Meta (plan 15). */
  getFacebookApp(): Promise<FacebookAppSettingsResponse> {
    return apiRequest<FacebookAppSettingsResponse>('/settings/facebook-app');
  },

  /** PUT /settings/facebook-app — không gửi `appSecret` = giữ nguyên secret đã lưu. */
  updateFacebookApp(
    body: UpdateFacebookAppSettingsBody,
  ): Promise<FacebookAppSettingsResponse> {
    return apiRequest<FacebookAppSettingsResponse>('/settings/facebook-app', {
      method: 'PUT',
      body,
    });
  },
};
