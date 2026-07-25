# Plan 10 — User Management CRUD + tracking người upload/chỉnh sửa content

**Milestone:** thuộc M7 (dọn FE còn sót) + bổ sung nhỏ cho M3
**Trạng thái:** ✅ xong 2026-07-25 (chốt MVP — code + test xanh; phần smoke UI/đăng thật
còn lại theo dõi ở `contexts.md` §6)
**Phụ thuộc:** M1 (users backend đã xong), M3 (content-assets giai đoạn 1)
**Spec:** `docs/04-api-spec.md` §users, `docs/05-rbac.md` §2

---

## 1. Mục tiêu

Hai việc user yêu cầu 2026-07-25:

1. **User Management CRUD chạy thật** — backend `/users` đã có đủ từ M1 nhưng FE
   `UserManagementPage` vẫn chạy trên `mockUsers` cục bộ. Nối API thật theo đúng
   pattern Real/Mock split (plan 04/05/06).
2. **Tracking người upload / người chỉnh sửa** cho trang "Quản lý Ảnh/Video Edit":
   bảng hiện tên người upload và tên người sửa gần nhất, kèm mốc thời gian.

## 2. Ngoài phạm vi

- Không làm `SettingsPage` (vẫn thuộc plan 08).
- Không làm audit log UI — vẫn ghi audit ở backend như cũ.
- Không làm giai đoạn 2 của content (duyệt / isAds / phân bổ page).
- Không đổi RBAC: `/users` vẫn chỉ ADMIN (`users:manage`).

## 3. Thiết kế

### 3.1 User Management (FE)

| Thứ | Nội dung |
|-----|----------|
| `src/api/users.api.ts` | `list(params)`, `create`, `update` (PUT), `remove` (DELETE = vô hiệu hóa) |
| `src/hooks/useUsers.ts` | `useUsers`, `useCreateUser`, `useUpdateUser`, `useDeleteUser` — mutation invalidate key `users` |
| `src/types/index.ts` | `UserResponse`, `PaginatedUsers`, `CreateUserBody`, `UpdateUserBody`, `QueryUsersParams` |
| `UserManagementPage.tsx` | tách `RealUserManagementPage` / `MockUserManagementPage` theo `env.useMock` |

Khớp DTO backend: `name` **bắt buộc** khi tạo (mock cũ thiếu field này), password
8–72 ký tự, `role` enum, `isActive` chỉ sửa qua PUT. DELETE là **soft delete**
(`isActive=false`) nên nút gọi là "Vô hiệu hóa", không phải "Xoá vĩnh viễn".
Lỗi backend đã có sẵn message tiếng Việt (admin cuối cùng, tự khóa mình, email
trùng) ⇒ FE chỉ hiển thị `ApiError.message`.

### 3.2 Tracking người upload / chỉnh sửa (BE + FE)

Schema: `content_assets` đã có `created_by` (người upload) nhưng **chưa có** cột
người sửa gần nhất ⇒ thêm `updated_by` (uuid, nullable — dòng cũ không biết ai sửa).

```prisma
updatedById String? @map("updated_by") @db.Uuid
updatedBy   User?   @relation("ContentUpdater", fields: [updatedById], references: [id])
```

- Migration: `content_assets_updated_by`.
- `erd.md`: thêm cột + quan hệ + dòng lịch sử (rule 05).
- Repository `findMany`/`findById` `include` 2 quan hệ user với `select`
  `{ id, name, email }` — **không** lấy `passwordHash`.
- Mapper thêm `createdBy: { id, name, email }` và `updatedBy: ... | null`,
  **giữ nguyên** `createdById`/`approvedById` để không phá FE hiện có.
- `update()` set `updatedById = actor.id`. `create()` set `updatedById = actor.id`
  luôn (người upload = người sửa đầu tiên) cho UI khỏi trống.

FE: bảng thêm 2 cột "Người upload" và "Người sửa gần nhất" (tên + thời điểm),
filter "Người upload" chỉ hiện với ADMIN (vì `GET /users` gác `users:manage`).

## 4. Task

- [x] Plan này
- [x] `src/api/users.api.ts` + `src/hooks/useUsers.ts` + type FE
- [x] `UserManagementPage` Real/Mock split, form có `name`, nút vô hiệu hóa
- [x] `schema.prisma` thêm `updated_by` + `erd.md` + migration `20260725062013_content_assets_updated_by`
- [x] Repository include user, mapper trả `createdBy`/`updatedBy`, service set `updatedById`
- [x] Test BE: `update` ghi `updatedById = actor.id`, mapper không lộ `passwordHash`
- [x] FE content page: 2 cột tracking + filter người upload (ADMIN)
- [x] `npm run lint && npm run build && npm run test` (BE 361 test xanh) · FE lint/build/test xanh
- [x] Cập nhật `contexts.md` + tick plan này

## 5. Điều kiện nghiệm thu

Đã kiểm qua **curl với backend thật** (port tạm 3002, dữ liệu smoke đã dọn):

- [x] Tạo user mới (name+email+password+role) → 201 trả user không có `passwordHash`
- [x] `PUT /users/:id` đổi tên + role → phản ánh đúng
- [x] Tự vô hiệu hóa chính mình ⇒ 400 "Không thể tự vô hiệu hóa tài khoản của mình"
- [x] Email trùng ⇒ 409 "Email đã tồn tại"
- [x] `DELETE /users/:id` ⇒ `isActive=false` (soft delete), dòng vẫn còn
- [x] `GET /content-assets` trả `createdBy {id,name,email}`; bài cũ `updatedBy=null`
- [x] `PATCH /content-assets/:id` ⇒ `updatedById` = actor, `updatedBy` có tên/email,
      response không chứa `passwordHash`
- [ ] **Chưa smoke UI thật:** ADMIN vào `/users` thao tác CRUD qua form; vào `/content`
      kiểm 2 cột "Người upload"/"Người sửa gần nhất"; CONTENT gõ `/users` bị chặn

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Dòng content cũ chưa có `updated_by` | Cột nullable, FE hiện "—" |
| Include quan hệ user dễ lộ `passwordHash` | Luôn `select { id, name, email }` ở repository, có test chặn |
| Type FE `User` (mock) lệch `UserResponse` (API) | Giữ 2 type riêng như các trang khác, không sửa type mock |

---

## 7. Kết quả

- **Ngày xong:** 2026-07-25 (chờ smoke UI)
- **File chính:** `frontend/src/api/users.api.ts`, `frontend/src/hooks/useUsers.ts`,
  `frontend/src/pages/UserManagementPage.tsx`, `frontend/src/pages/ContentManagementPage.tsx`,
  `frontend/src/types/index.ts`, `backend/prisma/schema.prisma`,
  `backend/src/modules/content-assets/{content-assets.repository,content-asset.mapper,content-assets.service}.ts`
- **Khác thiết kế ban đầu:** `create()` cũng set `updatedById = actor.id` (người upload
  = người sửa đầu tiên) nên bài mới không bao giờ trống cột "Người sửa gần nhất".
  Bản Real của `/content` bỏ cột "Ngày cập nhật" riêng — mốc thời gian đã nằm trong
  ô "Người sửa gần nhất" nên giữ 2 cột là trùng lặp. Filter "Người upload" chỉ hiện
  với ADMIN vì `GET /users` gác `users:manage`.
- **Test:** BE 361 test / 30 suite xanh (+4: `create` set `updatedById`, mapper chỉ
  trả 3 field user, `update` ghi `updatedById=actor`, `updatedBy=null` với bài cũ).
  FE 16 test cũ vẫn xanh. lint+build 2 phía xanh.
- **Còn nợ:** chưa smoke UI thật (§5 mục cuối). Chưa có test riêng cho FE
  `users.api.ts` (CRUD thuần, rule 02 không bắt buộc).
