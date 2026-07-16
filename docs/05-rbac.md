# 05 — RBAC

> Roles, permissions, guards — v3.0 (3 role)

---

## 1. Roles

| Role | Mô tả | Workspace chính |
|------|-------|-----------------|
| `ADMIN` | Toàn quyền hệ thống | All modules + Monitor |
| `EDITOR` | Duyệt bài, quản lý cài đặt đăng tự động | Quản lý Ảnh/Video, Auto-Post, Timeline |
| `CONTENT` | Upload và quản lý content của mình | Quản lý Ảnh/Video (bài của mình) |

Không còn `REVIEWER` / `PUBLISHER` riêng — việc duyệt gộp vào trang Quản lý Ảnh/Video
(EDITOR), việc đăng bài do **Bot** tự động theo Cài đặt đăng bài tự động.

---

## 2. Permission Matrix

| Permission | ADMIN | EDITOR | CONTENT |
|------------|:-----:|:------:|:-------:|
| `users:manage` | ✓ | | |
| `pages:manage` | ✓ | | |
| `content:create` | ✓ | ✓ | ✓ |
| `content:edit` | ✓ | ✓ | ✓ (bài của mình) |
| `content:delete` | ✓ | ✓ | ✓ (bài của mình) |
| `content:review` (đổi trạng thái, is_ads) | ✓ | ✓ | |
| `autopost:manage` | ✓ | ✓ | |
| `timeline:view` | ✓ | ✓ | |
| `queue:view` | ✓ | | |
| `jobs:retry` | ✓ | | |
| `audit:view` | ✓ | | |
| `dashboard:view` | ✓ | ✓ | ✓ |

---

## 3. Content User Restrictions

CONTENT **không được:**

- Đổi trạng thái duyệt (Chờ duyệt/Đã duyệt/Không duyệt)
- Tick "Đạt ADS"
- Xem/sửa Cài đặt đăng bài tự động, Timeline
- Xem Monitor (queue/failed/audit)
- Thao tác trên bài của người khác

CONTENT **được:**

- Upload ảnh/video, nhập caption/hashtags, chọn dạng, phân bổ page
- Sửa/xóa bài của mình (bài Không duyệt sửa xong tự quay lại Chờ duyệt)

---

## 4. Editor Restrictions

EDITOR **không được:**

- Quản lý users/pages/tokens
- Xem Monitor (queue/failed/audit), retry job

EDITOR **được:**

- Mọi thao tác content (mọi bài): edit, đổi trạng thái duyệt, tick Đạt ADS
- Không duyệt bắt buộc kèm lý do
- CRUD Cài đặt đăng bài tự động (mốc giờ, dạng bài, loại media, số bài)
- Xem Timeline lịch đăng

---

## 5. Trạng thái do hệ thống quản lý

`PUBLISHING` / `PUBLISHED` do **Bot** cập nhật khi job chạy — không role nào set tay
(UI disable 2 option này trong form edit).

---

## 6. Backend Implementation

### Permission decorator

```typescript
// common/decorators/require-permission.decorator.ts
export const RequirePermission = (...perms: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);
```

### Guard

```typescript
@Injectable()
export class PermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<Permission[]>(PERMISSIONS_KEY, ...);
    const user = context.switchToHttp().getRequest().user;
    return required.every(p => ROLE_PERMISSIONS[user.role].includes(p));
  }
}
```

### Usage

```typescript
@Patch(':id')
@RequirePermission('content:edit')  // status/is_ads trong DTO đòi thêm content:review
@UseGuards(JwtAuthGuard, PermissionsGuard)
update(@Param('id') id: string, @Body() dto: UpdateContentDto) { ... }
```

Lưu ý: `PATCH /content-assets/:id` là endpoint duy nhất cho cả sửa nội dung lẫn
duyệt — service kiểm tra: nếu payload chứa `status`/`is_ads` thì yêu cầu
`content:review`; nếu user là CONTENT thì chỉ cho sửa bài `created_by` của mình.

---

## 7. Frontend Route Guards

```typescript
// utils/permissions.ts
export type UserRole = 'ADMIN' | 'EDITOR' | 'CONTENT';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [/* all */],
  EDITOR: [
    'content:create', 'content:edit', 'content:delete', 'content:review',
    'autopost:manage', 'timeline:view', 'dashboard:view',
  ],
  CONTENT: ['content:create', 'content:edit', 'content:delete', 'dashboard:view'],
};
```

### Route map

```typescript
const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/content': ['ADMIN', 'EDITOR', 'CONTENT'],
  '/timeline': ['ADMIN', 'EDITOR'],
  '/auto-post': ['ADMIN', 'EDITOR'],
  '/pages': ['ADMIN'],
  '/users': ['ADMIN'],
  '/queue': ['ADMIN'],
  '/failed': ['ADMIN'],
  '/audit': ['ADMIN'],
};
```

---

## 8. Audit Actions by Role

| Action | Typical Role |
|--------|--------------|
| `USER_CREATE` | ADMIN |
| `PAGE_UPDATE` / `PAGE_TOKEN_UPDATE` | ADMIN |
| `CONTENT_UPLOAD` | CONTENT |
| `CONTENT_STATUS_CHANGE` | EDITOR |
| `CONTENT_ADS_MARK` | EDITOR |
| `AUTOPOST_CONFIG_UPDATE` | EDITOR, ADMIN |
| `JOB_RETRY` | ADMIN |
| `AUTO_PUBLISH` | Bot (system) |

---

## 9. Seed Permissions (optional V1)

V1 dùng enum `UserRole` + hardcoded `ROLE_PERMISSIONS` map.

V2 có thể migrate sang bảng `permissions` + `role_permissions` nếu cần dynamic RBAC.
