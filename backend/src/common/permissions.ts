import { UserRole } from '../../generated/prisma/client';

/**
 * Ma trận quyền tĩnh theo docs/05-rbac.md §2.
 * V1 hardcode map này; V2 mới cân nhắc bảng permissions động (docs/05 §9).
 */
export const PERMISSIONS = [
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
  'audit:view',
  'dashboard:view',
  // Cấu hình động (Drive service account...) — chỉ ADMIN, vì chứa secret hạng nặng.
  'settings:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.ADMIN]: PERMISSIONS,
  [UserRole.EDITOR]: [
    'content:create',
    'content:edit',
    'content:delete',
    'content:review',
    'autopost:manage',
    'timeline:view',
    'dashboard:view',
  ],
  // CONTENT chỉ thao tác bài của mình — ràng buộc "của mình" kiểm ở service,
  // permission ở đây chỉ chặn tầng route.
  [UserRole.CONTENT]: [
    'content:create',
    'content:edit',
    'content:delete',
    'dashboard:view',
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
