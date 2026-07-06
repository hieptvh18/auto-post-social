# 05 — RBAC

> Roles, permissions, guards — v2.0

---

## 1. Roles

| Role | Mô tả | Workspace |
|------|-------|-----------|
| `ADMIN` | Toàn quyền hệ thống | All modules |
| `CONTENT` | Tạo và quản lý content | Content Library |
| `REVIEWER` | Duyệt nội dung (Leader) | Review Center |
| `PUBLISHER` | Lên lịch và đăng bài | Publisher Center |

**Không có VIEWER role** trong v2.0 — xem dashboard theo quyền từng role.

---

## 2. Permission Matrix

| Permission | ADMIN | CONTENT | REVIEWER | PUBLISHER |
|------------|:-----:|:-------:|:--------:|:---------:|
| `users:manage` | ✓ | | | |
| `pages:manage` | ✓ | | | |
| `content:create` | ✓ | ✓ | | |
| `content:edit` | ✓ | ✓ | | |
| `content:delete` | ✓ | ✓ | | |
| `content:submit` | ✓ | ✓ | | |
| `content:review` | ✓ | | ✓ | |
| `content:comment` | ✓ | | ✓ | |
| `publish:schedule` | ✓ | | | ✓ |
| `publish:cancel` | ✓ | | | ✓ |
| `publish:retry` | ✓ | | | ✓ |
| `queue:view` | ✓ | | | ✓ |
| `audit:view` | ✓ | | | |
| `dashboard:view` | ✓ | ✓ | ✓ | ✓ |

---

## 3. Content User Restrictions

CONTENT **không được:**

- Schedule publish
- Chọn fanpage
- Approve/reject content
- Xem queue monitor (trừ ADMIN override)

---

## 4. Reviewer Restrictions

REVIEWER **không được:**

- Tạo/sửa content (trừ comment)
- Schedule publish
- Quản lý users/pages

REVIEWER **được:**

- Xem content WAITING_APPROVAL (+ history)
- Approve / Reject
- Comment (reject bắt buộc comment)

---

## 5. Publisher Restrictions

PUBLISHER **không được:**

- Tạo/sửa content gốc
- Approve/reject
- Quản lý users/pages/tokens

PUBLISHER **được:**

- Xem content `status = APPROVED`
- Setup caption, hashtag, thumbnail override, fanpage, schedule time
- Retry failed jobs
- Xem calendar + queue

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
@Post(':id/approve')
@RequirePermission('content:review')
@UseGuards(JwtAuthGuard, PermissionsGuard)
approve(@Param('id') id: string) { ... }
```

---

## 7. Frontend Route Guards

```typescript
// utils/permissions.ts
export type UserRole = 'ADMIN' | 'CONTENT' | 'REVIEWER' | 'PUBLISHER';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [/* all */],
  CONTENT: ['content:create', 'content:edit', 'content:delete', 'content:submit', 'dashboard:view'],
  REVIEWER: ['content:review', 'content:comment', 'dashboard:view'],
  PUBLISHER: ['publish:schedule', 'publish:cancel', 'publish:retry', 'queue:view', 'dashboard:view'],
};
```

### Route map

```typescript
const ROUTE_ROLES: Record<string, UserRole[]> = {
  '/content': ['ADMIN', 'CONTENT'],
  '/review': ['ADMIN', 'REVIEWER'],
  '/publisher': ['ADMIN', 'PUBLISHER'],
  '/calendar': ['ADMIN', 'PUBLISHER'],
  '/queue': ['ADMIN', 'PUBLISHER'],
  '/failed': ['ADMIN', 'PUBLISHER'],
  '/pages': ['ADMIN'],
  '/users': ['ADMIN'],
  '/audit': ['ADMIN'],
};
```

---

## 8. Audit Actions by Role

| Action | Typical Role |
|--------|--------------|
| `USER_CREATE` | ADMIN |
| `PAGE_UPDATE` | ADMIN |
| `CONTENT_CREATE` | CONTENT |
| `CONTENT_SUBMIT` | CONTENT |
| `CONTENT_APPROVE` | REVIEWER |
| `CONTENT_REJECT` | REVIEWER |
| `PUBLISH_SCHEDULE` | PUBLISHER |
| `PUBLISH_RETRY` | PUBLISHER |
| `PUBLISH_CANCEL` | PUBLISHER |

---

## 9. Seed Permissions (optional V1)

V1 có thể dùng enum `UserRole` + hardcoded `ROLE_PERMISSIONS` map.

V2 có thể migrate sang bảng `permissions` + `role_permissions` nếu cần dynamic RBAC.

---

## 10. Migration từ v1 frontend

| v1 | v2 |
|----|-----|
| `VIEWER` | Remove hoặc map → read-only dashboard (nếu cần) |
| `content:approve` (CONTENT) | → `content:review` (REVIEWER only) |
| `content:sync` | Remove (no Google Sheet) |
| `approved: boolean` | → `status: ContentStatus` |
