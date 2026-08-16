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
  // Plan 26 — reup: CHỈ SUPER_ADMIN. Xem ADMIN_PERMISSIONS bên dưới.
  'reup:view', // xem menu Reup, xem chủ đề/video/nhật ký
  'reup:manage', // tạo/sửa/xoá chủ đề, quét tay, xoá resource tay
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Tiền tố của nhóm permission chỉ SUPER_ADMIN mới có. */
const REUP_PERMISSION_PREFIX = 'reup:';

/**
 * ADMIN = mọi permission TRỪ `reup:*`.
 *
 * Cạm bẫy C2 (plan 26 §3.2): trước đây map là `[ADMIN]: PERMISSIONS`, nên thêm
 * bất kỳ permission mới nào vào mảng `PERMISSIONS` là ADMIN **tự động** nhận —
 * đúng thứ phá mục tiêu của plan. Phải lọc tường minh, không dùng thẳng hằng.
 */
const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (permission) => !permission.startsWith(REUP_PERMISSION_PREFIX),
);

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  // SUPER_ADMIN là role duy nhất có `reup:*`.
  [UserRole.SUPER_ADMIN]: PERMISSIONS,
  [UserRole.ADMIN]: ADMIN_PERMISSIONS,
  // EDITOR (người dựng ảnh/video) chỉ làm việc trên màn Quản lý Ảnh/Video +
  // Hướng dẫn sử dụng (chốt với user 2026-08-07). Không Tổng quan, không Lịch
  // đăng bài, không Cài đặt đăng tự động — lệch docs/05-rbac.md §2, xem
  // contexts.md §6.
  [UserRole.EDITOR]: [
    'content:create',
    'content:edit',
    'content:delete',
    'content:review',
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

/**
 * "Quản trị viên" theo nghĩa nghiệp vụ = ADMIN **hoặc** SUPER_ADMIN.
 *
 * Plan 26: mọi chỗ trước đây so `role === UserRole.ADMIN` để quyết định đặc
 * quyền (tự duyệt bài, xem số user, thao tác job của người khác...) đều phải
 * đi qua hàm này — nếu không, SUPER_ADMIN lại **kém quyền hơn** ADMIN.
 */
export function isAdminLevel(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}
