import type { UserRole } from '../types';

type Permission =
  | 'users:manage'
  | 'pages:manage'
  | 'content:edit'
  | 'content:approve'
  | 'content:sync'
  | 'publish:schedule'
  | 'publish:retry'
  | 'audit:view';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    'users:manage',
    'pages:manage',
    'content:edit',
    'content:approve',
    'content:sync',
    'publish:schedule',
    'publish:retry',
    'audit:view',
  ],
  CONTENT: ['content:edit', 'content:approve', 'content:sync'],
  PUBLISHER: ['publish:schedule', 'publish:retry'],
  VIEWER: [],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canAccessRoute(role: UserRole, path: string): boolean {
  const restricted: Record<string, UserRole[]> = {
    '/users': ['ADMIN'],
    '/pages': ['ADMIN'],
    '/audit': ['ADMIN'],
  };

  const allowedRoles = restricted[path];
  if (!allowedRoles) return true;
  return allowedRoles.includes(role);
}
