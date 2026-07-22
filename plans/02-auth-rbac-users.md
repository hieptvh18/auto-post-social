# Plan 02 — Auth JWT + RBAC + Users

**Milestone:** M1
**Trạng thái:** ⬜
**Phụ thuộc:** Plan 01
**Spec:** `docs/04-api-spec.md` §1 §2, `docs/05-rbac.md`

---

## 1. Mục tiêu

Đăng nhập được bằng JWT, mọi endpoint sau đó bảo vệ bằng guard theo ma trận quyền
3 role. Admin quản lý được user.

## 2. Ngoài phạm vi

Đổi mật khẩu, quên mật khẩu, refresh-token rotation/blacklist, dynamic RBAC (bảng
permissions). Refresh token MVP chỉ ký + verify, không lưu DB.

## 3. Thiết kế

**Endpoint**

| Method | Path | Quyền |
|--------|------|-------|
| POST | `/auth/login` | public |
| POST | `/auth/refresh` | public |
| GET | `/auth/me` | auth |
| GET/POST/PUT/DELETE | `/users` `/users/:id` | `users:manage` (ADMIN) |

DELETE user = soft delete (`isActive = false`).

**RBAC**

```text
common/permissions.ts         → type Permission, ROLE_PERMISSIONS map (docs/05 §2)
common/decorators/require-permission.decorator.ts
common/guards/jwt-auth.guard.ts
common/guards/permissions.guard.ts   → required.every(p => ROLE_PERMISSIONS[role].includes(p))
common/decorators/current-user.decorator.ts
```

JWT payload: `{ sub, email, role }`. Access `JWT_ACCESS_EXPIRES`, refresh `JWT_REFRESH_EXPIRES`.
User `isActive=false` ⇒ login 401, token cũ ⇒ 401 (guard kiểm DB).

## 4. Task

- [ ] `common/permissions.ts` — Permission union type + ROLE_PERMISSIONS
- [ ] `RequirePermission` decorator + `PermissionsGuard` + `JwtAuthGuard` + `CurrentUser`
- [ ] `AuthModule`: `AuthService.login/refresh/validateUser`, JwtStrategy
- [ ] `UsersModule`: repository + service + controller, bcrypt 12, email lowercase+trim
- [ ] Chặn admin tự vô hiệu hóa chính mình / xóa admin cuối cùng
- [ ] Audit log `USER_CREATE` / `USER_UPDATE`
- [ ] Swagger + `@ApiBearerAuth()`
- [ ] Unit test 100%: AuthService (sai pass, user inactive, token hết hạn, refresh),
      UsersService (trùng email 409, not found 404, soft delete, chặn tự khóa),
      PermissionsGuard (mọi role × mọi permission trong ma trận docs/05 §2)
- [ ] `npm run lint && npm run test:cov && npm run build` xanh
- [ ] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [ ] Login admin seed → nhận access + refresh token
- [ ] `GET /auth/me` trả đúng user; không token ⇒ 401
- [ ] CONTENT gọi `GET /users` ⇒ 403; EDITOR ⇒ 403; ADMIN ⇒ 200
- [ ] User bị `isActive=false` không login được

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Guard đăng ký sai thứ tự ⇒ mọi route thành public | Test guard riêng + 1 e2e smoke 401/403 |
| Rò password hash ra response | Mapper loại `passwordHash`, test khẳng định field không tồn tại |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:**
- **Còn nợ:**
