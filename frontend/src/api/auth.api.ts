import type { AuthUser, LoginResponse } from '../types';
import { apiRequest } from './client';

export const authApi = {
  /** POST /auth/login — skipAuth vì chưa có token. */
  login(email: string, password: string): Promise<LoginResponse> {
    return apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      skipAuth: true,
    });
  },

  /** GET /auth/me — nạp lại user hiện tại từ access token đã lưu. */
  me(): Promise<AuthUser> {
    return apiRequest<AuthUser>('/auth/me');
  },
};
