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
  | 'audit:view'
  // Plan 26 — CHỈ SUPER_ADMIN. Phải khớp `backend/src/common/permissions.ts`.
  | 'reup:view'
  | 'reup:manage';

/** Mọi permission mà ADMIN có (tức tất cả TRỪ `reup:*`). */
const ADMIN_PERMISSIONS: Permission[] = [
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
];

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  // SUPER_ADMIN = mọi quyền của ADMIN + `reup:*` (plan 26 §3.3).
  SUPER_ADMIN: [...ADMIN_PERMISSIONS, 'reup:view', 'reup:manage'],
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

/**
 * Cạm bẫy C1 (plan 26): map này là **allowlist role cứng**, không đi qua
 * `ROLE_PERMISSIONS`. Thêm role mới mà quên thêm vào ĐÂY thì người đó đăng nhập
 * xong **không thấy menu nào** — lỗi dễ mắc nhất của cả plan.
 *
 * ⇒ SUPER_ADMIN phải có mặt ở MỌI dòng đang có 'ADMIN'. Test FE duyệt toàn bộ
 * key của map này, không chỉ vài route mẫu.
 */
export const RESTRICTED_ROUTES: Record<string, UserRole[]> = {
  '/dashboard': ['SUPER_ADMIN', 'ADMIN', 'CONTENT'],
  '/content': ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'CONTENT'],
  '/timeline': ['SUPER_ADMIN', 'ADMIN'],
  '/auto-post': ['SUPER_ADMIN', 'ADMIN'],
  '/pages': ['SUPER_ADMIN', 'ADMIN'],
  '/users': ['SUPER_ADMIN', 'ADMIN'],
  '/settings': ['SUPER_ADMIN', 'ADMIN'],
  '/queue': ['SUPER_ADMIN', 'ADMIN'],
  '/failed': ['SUPER_ADMIN', 'ADMIN'],
  '/audit': ['SUPER_ADMIN', 'ADMIN'],
  // Route mới của plan 27 — chỉ SUPER_ADMIN.
  '/reup': ['SUPER_ADMIN'],
};

export function canAccessRoute(role: UserRole, path: string): boolean {
  const allowedRoles = RESTRICTED_ROUTES[path];
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
