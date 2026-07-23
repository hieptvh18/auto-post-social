# Plan 02 — Auth JWT + RBAC + Users

**Milestone:** M1
**Trạng thái:** ✅ 2026-07-22
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

- [x] `common/permissions.ts` — Permission union type + ROLE_PERMISSIONS
- [x] `RequirePermission` decorator + `PermissionsGuard` + `JwtAuthGuard` + `CurrentUser`
- [x] `AuthModule`: `AuthService.login/refresh/validateUser` (bỏ JwtStrategy — xem §7)
- [x] `UsersModule`: repository + service + controller, bcrypt 12, email lowercase+trim
- [x] Chặn admin tự vô hiệu hóa chính mình / xóa admin cuối cùng
- [x] Audit log `USER_CREATE` / `USER_UPDATE` / `USER_DELETE`
- [x] Swagger + `@ApiBearerAuth()`
- [x] Unit test 100%: AuthService (sai pass, user inactive, token hết hạn, refresh),
      UsersService (trùng email 409, not found 404, soft delete, chặn tự khóa),
      PermissionsGuard (mọi role × mọi permission trong ma trận docs/05 §2)
- [x] `npm run lint && npm run test:cov && npm run build` xanh
- [x] Cập nhật `contexts.md`
- [x] *(phát sinh)* `PasswordService` trong `infra/crypto/` — bọc bcrypt sau interface
      để service test được mà không đụng bcrypt thật
- [x] *(phát sinh)* `@Public()` decorator + gắn vào `HealthController` — guard đăng ký
      global nên health check sẽ thành 401 nếu không opt-out

## 5. Điều kiện nghiệm thu

Đã chạy thật với API + Postgres ngày 2026-07-22, tất cả đúng kỳ vọng:

- [x] Login admin seed → nhận access + refresh token (sai mật khẩu ⇒ 401)
- [x] `GET /auth/me` trả đúng user; không token ⇒ 401
- [x] CONTENT gọi `GET /users` ⇒ 403; EDITOR ⇒ 403; ADMIN ⇒ 200
- [x] User bị `isActive=false` không login được — và **token cũ cũng mất hiệu lực ngay**
- [x] `POST /auth/refresh` ⇒ 200 cấp lại cặp token
- [x] Trùng email ⇒ 409; email hoa/thường được chuẩn hóa về lowercase
- [x] Admin tự khóa / tự hạ quyền ⇒ 400
- [x] Audit log ghi đúng `USER_CREATE` / `USER_DELETE` kèm actor

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Guard đăng ký sai thứ tự ⇒ mọi route thành public | Test guard riêng + 1 e2e smoke 401/403 |
| Rò password hash ra response | Mapper loại `passwordHash`, test khẳng định field không tồn tại |

---

## 7. Kết quả

- **Ngày xong:** 2026-07-22
- **File chính:**
  - `backend/src/common/permissions.ts`, `common/guards/`, `common/decorators/`
  - `backend/src/modules/auth/auth.service.ts`
  - `backend/src/modules/users/users.service.ts` + `users.repository.ts`
  - `backend/src/modules/audit/audit.service.ts`
  - `backend/src/infra/crypto/password.service.ts`
- **Khác thiết kế ban đầu:**
  1. **Bỏ passport/JwtStrategy**, dùng thẳng `JwtService.verifyAsync` trong
     `JwtAuthGuard`. Guard vốn đã phải đọc lại DB mỗi request (để user bị khóa mất
     hiệu lực ngay), nên strategy chỉ là một lớp trung gian không thêm hành vi.
  2. **Guard đăng ký global** qua `APP_GUARD` trong `app.module.ts` thay vì
     `@UseGuards` từng route → mặc định mọi route được bảo vệ, route công khai phải
     opt-out bằng `@Public()`. An toàn hơn khi quên gắn guard.
  3. Thêm `USER_DELETE` vào audit (plan chỉ ghi CREATE/UPDATE) — soft delete là
     hành vi đáng lần vết.
  4. `expiresIn` quy đổi sang **số giây** qua `common/utils/duration.ts` trước khi
     ký, tránh phụ thuộc kiểu template `StringValue` của thư viện `ms`.
- **Test:** 184 test / 18 suite · coverage service/domain 100% cả 4 chỉ số ·
  lint + build xanh · đã smoke test thật toàn bộ §5
- **Còn nợ:** Pino logger vẫn chưa wire (chuyển sang M2 — xem `contexts.md` §6).
  Chưa có e2e test tự động; §5 hiện kiểm bằng tay.
