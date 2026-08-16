import { UserRole } from '../../../generated/prisma/client';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  isAdminLevel,
  type Permission,
} from '../permissions';

/**
 * Ma trận kỳ vọng theo docs/05-rbac.md §2, **trừ** EDITOR: chốt lại với user
 * 2026-08-07 là EDITOR chỉ dùng màn Quản lý Ảnh/Video + Hướng dẫn sử dụng, nên
 * mất `autopost:manage`, `timeline:view`, `dashboard:view` (nợ docs — contexts §6).
 */
const S = UserRole.SUPER_ADMIN;

const MATRIX: Record<Permission, UserRole[]> = {
  'users:manage': [S, UserRole.ADMIN],
  'pages:manage': [S, UserRole.ADMIN],
  'content:create': [S, UserRole.ADMIN, UserRole.EDITOR, UserRole.CONTENT],
  'content:edit': [S, UserRole.ADMIN, UserRole.EDITOR, UserRole.CONTENT],
  'content:delete': [S, UserRole.ADMIN, UserRole.EDITOR, UserRole.CONTENT],
  'content:review': [S, UserRole.ADMIN, UserRole.EDITOR],
  'autopost:manage': [S, UserRole.ADMIN],
  'timeline:view': [S, UserRole.ADMIN],
  'queue:view': [S, UserRole.ADMIN],
  'jobs:retry': [S, UserRole.ADMIN],
  'audit:view': [S, UserRole.ADMIN],
  'dashboard:view': [S, UserRole.ADMIN, UserRole.CONTENT],
  // Cấu hình động chứa service account Drive => chỉ ADMIN (chốt với user).
  'settings:manage': [S, UserRole.ADMIN],
  // Plan 26 — CHỈ SUPER_ADMIN. ADMIN cố tình vắng mặt ở 2 dòng này.
  'reup:view': [S],
  'reup:manage': [S],
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
    it('SUPER_ADMIN có toàn bộ permission, gồm cả reup:*', () => {
      expect([...ROLE_PERMISSIONS[UserRole.SUPER_ADMIN]]).toEqual([
        ...PERMISSIONS,
      ]);
    });

    /**
     * Cạm bẫy C2: trước plan 26 map là `[ADMIN]: PERMISSIONS`. Test này liệt kê
     * TỪNG permission cũ (không assert bằng `.length`) để việc tách
     * `ADMIN_PERMISSIONS` không âm thầm làm rụng quyền nào của ADMIN — đúng
     * yêu cầu chống hồi quy ở plan 26 §6 R3.
     */
    it('ADMIN giữ đủ mọi permission cũ, KHÔNG có reup:*', () => {
      expect([...ROLE_PERMISSIONS[UserRole.ADMIN]]).toEqual([
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
        'settings:manage',
      ]);
    });

    it.each(['reup:view', 'reup:manage'] as const)(
      'ADMIN không có %s',
      (permission) => {
        expect(hasPermission(UserRole.ADMIN, permission)).toBe(false);
      },
    );

    it('CONTENT không có content:review', () => {
      expect(ROLE_PERMISSIONS[UserRole.CONTENT]).not.toContain(
        'content:review',
      );
    });

    it.each([
      [UserRole.SUPER_ADMIN, true],
      [UserRole.ADMIN, true],
      [UserRole.EDITOR, false],
      [UserRole.CONTENT, false],
    ] as const)('isAdminLevel(%s) = %s', (role, expected) => {
      expect(isAdminLevel(role)).toBe(expected);
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
