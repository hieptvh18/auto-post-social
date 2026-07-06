import type { AuthUser } from '../types';
import { PREVIEW_EMAILS } from '../utils/constants';

/** Bật khi preview UI — tắt khi nối API thật */
export const UI_PREVIEW_SKIP_AUTH = true;

export const DEMO_USER: AuthUser = {
  id: 'demo',
  email: PREVIEW_EMAILS.ADMIN,
  role: 'ADMIN',
};
