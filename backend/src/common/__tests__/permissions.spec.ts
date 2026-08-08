import { UserRole } from '../../../generated/prisma/client';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  type Permission,
} from '../permissions';

/**
 * Ma trận kỳ vọng theo docs/05-rbac.md §2, **trừ** EDITOR: chốt lại với user
 * 2026-08-07 là EDITOR chỉ dùng màn Quản lý Ảnh/Video + Hướng dẫn sử dụng, nên
 * mất `autopost:manage`, `timeline:view`, `dashboard:view` (nợ docs — contexts §6).
 */
const MATRIX: Record<Permission, UserRole[]> = {
  'users:manage': [UserRole.ADMIN],
  'pages:manage': [UserRole.ADMIN],
  'content:create': [UserRole.ADMIN, UserRole.EDITOR, UserRole.CONTENT],
  'content:edit': [UserRole.ADMIN, UserRole.EDITOR, UserRole.CONTENT],
  'content:delete': [UserRole.ADMIN, UserRole.EDITOR, UserRole.CONTENT],
  'content:review': [UserRole.ADMIN, UserRole.EDITOR],
  'autopost:manage': [UserRole.ADMIN],
  'timeline:view': [UserRole.ADMIN],
  'queue:view': [UserRole.ADMIN],
  'jobs:retry': [UserRole.ADMIN],
  'audit:view': [UserRole.ADMIN],
  'dashboard:view': [UserRole.ADMIN, UserRole.CONTENT],
  // Cấu hình động chứa service account Drive => chỉ ADMIN (chốt với user).
  'settings:manage': [UserRole.ADMIN],
};

describe('permissions', () => {
  describe('hasPermission', () => {
    // Phủ toàn bộ ô của ma trận: mọi role × mọi permission.
    const roles = Object.values(UserRole);

    it.each(
      roles.flatMap((role) =>
        PERMISSIONS.map((permission) => [role, permission] as const),
      ),
    )(
      'role %s với permission %s đúng theo ma trận docs/05',
      (role, permission) => {
        const expected = MATRIX[permission].includes(role);
        expect(hasPermission(role, permission)).toBe(expected);
      },
    );
  });

  describe('ROLE_PERMISSIONS', () => {
    it('ADMIN có toàn bộ permission', () => {
      expect([...ROLE_PERMISSIONS[UserRole.ADMIN]]).toEqual([...PERMISSIONS]);
    });

    it('CONTENT không có content:review', () => {
      expect(ROLE_PERMISSIONS[UserRole.CONTENT]).not.toContain(
        'content:review',
      );
    });

    it('EDITOR chỉ còn quyền của màn Quản lý Ảnh/Video', () => {
      expect([...ROLE_PERMISSIONS[UserRole.EDITOR]]).toEqual([
        'content:create',
        'content:edit',
        'content:delete',
        'content:review',
      ]);
    });
  });
});
