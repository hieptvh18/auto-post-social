import type { UserRole } from '../types';

type Permission =
  | 'users:manage'
  | 'pages:manage'
  | 'content:create'
  | 'content:edit'
  | 'content:delete'
  | 'content:review' // đổi trạng thái duyệt, đánh dấu Đạt ADS
  | 'autopost:manage'
  | 'timeline:view'
  | 'queue:view'
  | 'jobs:retry'
  | 'dashboard:view'
  | 'settings:manage'
  | 'audit:view';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    'users:manage',
    'pages:manage',
    'content:create',
    'content:edit',
    'content:delete',
    'content:review',
    'autopost:manage',
    'timeline:view',
    'queue:view',
    'jobs:retry',
    'dashboard:view',
    'settings:manage',
    'audit:view',
  ],
  // EDITOR chỉ làm việc trên màn Quản lý Ảnh/Video + Hướng dẫn sử dụng
  // (chốt 2026-08-07) — phải khớp `backend/src/common/permissions.ts`.
  EDITOR: ['content:create', 'content:edit', 'content:delete', 'content:review'],
  CONTENT: ['content:create', 'content:edit', 'content:delete', 'dashboard:view'],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAccessRoute(role: UserRole, path: string): boolean {
  const restricted: Record<string, UserRole[]> = {
    '/dashboard': ['ADMIN', 'CONTENT'],
    '/content': ['ADMIN', 'EDITOR', 'CONTENT'],
    '/timeline': ['ADMIN'],
    '/auto-post': ['ADMIN'],
    '/pages': ['ADMIN'],
    '/users': ['ADMIN'],
    '/settings': ['ADMIN'],
    '/queue': ['ADMIN'],
    '/failed': ['ADMIN'],
    '/audit': ['ADMIN'],
  };

  const allowedRoles = restricted[path];
  if (!allowedRoles) return true;
  return allowedRoles.includes(role);
}

/**
 * Màn hình mặc định sau khi đăng nhập / khi vào route không có quyền. EDITOR
 * không vào được `/dashboard` nên phải rơi về `/content`, nếu không sẽ lặp
 * redirect vô hạn.
 */
export function defaultRouteFor(role: UserRole): string {
  return role === 'EDITOR' ? '/content' : '/dashboard';
}
