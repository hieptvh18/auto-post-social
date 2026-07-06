import type { AuthUser } from '../types';

/** Bật khi preview UI — tắt khi nối API thật */
export const UI_PREVIEW_SKIP_AUTH = true;

export const DEMO_USER: AuthUser = {
  id: 'demo',
  email: 'admin@company.com',
  role: 'ADMIN',
};
