/**
 * Lưu access/refresh token trong localStorage. Là nguồn sự thật duy nhất về token
 * cho cả `api/client.ts` (gắn Bearer, refresh) lẫn `AuthContext` (khôi phục phiên).
 */
const ACCESS_KEY = 'taf.accessToken';
const REFRESH_KEY = 'taf.refreshToken';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export const tokenStore = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(tokens: AuthTokens): void {
    localStorage.setItem(ACCESS_KEY, tokens.accessToken);
    localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};
