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
    'audit:view',
  ],
  EDITOR: [
    'content:create',
    'content:edit',
    'content:delete',
    'content:review',
    'autopost:manage',
    'timeline:view',
    'dashboard:view',
  ],
  CONTENT: ['content:create', 'content:edit', 'content:delete', 'dashboard:view'],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAccessRoute(role: UserRole, path: string): boolean {
  const restricted: Record<string, UserRole[]> = {
    '/content': ['ADMIN', 'EDITOR', 'CONTENT'],
    '/timeline': ['ADMIN', 'EDITOR'],
    '/auto-post': ['ADMIN', 'EDITOR'],
    '/pages': ['ADMIN'],
    '/users': ['ADMIN'],
    '/queue': ['ADMIN'],
    '/failed': ['ADMIN'],
    '/audit': ['ADMIN'],
  };

  const allowedRoles = restricted[path];
  if (!allowedRoles) return true;
  return allowedRoles.includes(role);
}
