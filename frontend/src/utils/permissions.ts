import type { UserRole } from '../types';

type Permission =
  | 'users:manage'
  | 'pages:manage'
  | 'content:create'
  | 'content:edit'
  | 'content:delete'
  | 'content:submit'
  | 'content:review'
  | 'content:comment'
  | 'publish:schedule'
  | 'publish:cancel'
  | 'publish:retry'
  | 'queue:view'
  | 'dashboard:view'
  | 'audit:view';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    'users:manage',
    'pages:manage',
    'content:create',
    'content:edit',
    'content:delete',
    'content:submit',
    'content:review',
    'content:comment',
    'publish:schedule',
    'publish:cancel',
    'publish:retry',
    'queue:view',
    'dashboard:view',
    'audit:view',
  ],
  CONTENT: ['content:create', 'content:edit', 'content:delete', 'content:submit', 'dashboard:view'],
  REVIEWER: ['content:review', 'content:comment', 'dashboard:view'],
  PUBLISHER: ['publish:schedule', 'publish:cancel', 'publish:retry', 'queue:view', 'dashboard:view'],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAccessRoute(role: UserRole, path: string): boolean {
  const restricted: Record<string, UserRole[]> = {
    '/content': ['ADMIN', 'CONTENT'],
    '/review': ['ADMIN', 'REVIEWER'],
    '/publisher': ['ADMIN', 'PUBLISHER'],
    '/scheduler': ['ADMIN', 'PUBLISHER'],
    '/queue': ['ADMIN', 'PUBLISHER'],
    '/failed': ['ADMIN', 'PUBLISHER'],
    '/users': ['ADMIN'],
    '/pages': ['ADMIN'],
    '/audit': ['ADMIN'],
  };

  const allowedRoles = restricted[path];
  if (!allowedRoles) return true;
  return allowedRoles.includes(role);
}
