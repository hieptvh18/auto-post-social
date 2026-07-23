import type { AuthUser } from '../types';
import { PREVIEW_EMAILS } from '../utils/constants';
import { env } from './env';

/**
 * Bỏ qua auth để preview UI bằng dữ liệu mock. Bật ⇔ VITE_USE_MOCK=true.
 * Khi tắt mock (nối API thật), phải đăng nhập thật mới vào được.
 */
export const UI_PREVIEW_SKIP_AUTH = env.useMock;

export const DEMO_USER: AuthUser = {
  id: 'demo',
  email: PREVIEW_EMAILS.ADMIN,
  role: 'ADMIN',
};
