# Plan 26 — Role SUPER_ADMIN + permission `reup:*`

**Milestone:** M12 · **Trạng thái:** ✅ xong 2026-08-15
**Phụ thuộc:** không
**Spec tham chiếu:** `docs/05-rbac.md` §2 — **plan này sửa docs, phải hỏi user trước** (rule 00 §1)
**Bản đồ:** [README.md](./README.md)

---

## 1. Mục tiêu

Hôm nay `ADMIN` là quyền cao nhất và có **toàn bộ** permission
(`ROLE_PERMISSIONS[ADMIN] = PERMISSIONS`). Không có cách nào tạo một người quản trị
cao hơn ADMIN.

Sau plan này: có role `SUPER_ADMIN` đứng trên `ADMIN`, sở hữu 2 permission mới
`reup:view` / `reup:manage` mà **ADMIN không có** — làm nền phân quyền cho toàn bộ
menu Reup Setting ở plan 27→30.

## 2. Ngoài phạm vi

- **Không** làm màn Reup nào ở plan này. Đây thuần là tầng phân quyền.
- **Không** đổi quyền hiện có của ADMIN/EDITOR/CONTENT. ADMIN sau plan này làm được
  **đúng y như trước**, chỉ là không thấy menu Reup.
- **Không** làm permission động lưu DB (`docs/05` §9 để V2). Vẫn hardcode ma trận.
- **Không** làm UI chuyển quyền hàng loạt / audit riêng cho việc đổi role.

## 3. Thiết kế

### 3.1 Role model

```prisma
enum UserRole {
  SUPER_ADMIN   // ← thêm mới, đứng đầu
  ADMIN
  EDITOR
  CONTENT
}
```

Migration: `ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN' BEFORE 'ADMIN';`
Không đổi `@default(CONTENT)`. Bản ghi cũ không bị ảnh hưởng.

> **Bắt buộc:** cập nhật `erd.md` (bảng Enum + Lịch sử thay đổi) trong **cùng** thay đổi
> — rule 05, không có ngoại lệ.

### 3.2 Permission mới — cạm bẫy C2

```ts
// src/common/permissions.ts
export const PERMISSIONS = [
  ...,
  'reup:view',      // xem menu Reup, xem chủ đề/video/nhật ký
  'reup:manage',    // tạo/sửa/xoá chủ đề, bấm quét tay, xoá resource tay
] as const;
```

**Không** được viết `[UserRole.ADMIN]: PERMISSIONS` như hiện tại nữa — làm vậy ADMIN
tự động nhận luôn `reup:*`, hỏng đúng mục tiêu plan. Phải tách:

```ts
const ADMIN_PERMISSIONS = PERMISSIONS.filter(p => !p.startsWith('reup:'));

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  [UserRole.SUPER_ADMIN]: PERMISSIONS,          // tất cả, gồm reup:*
  [UserRole.ADMIN]: ADMIN_PERMISSIONS,          // tất cả TRỪ reup:*
  [UserRole.EDITOR]: [...giữ nguyên],
  [UserRole.CONTENT]: [...giữ nguyên],
};
```

### 3.3 Frontend — cạm bẫy C1, C3

Ba chỗ **bắt buộc** sửa, thiếu một chỗ là super-admin dùng không được:

1. `frontend/src/utils/permissions.ts`
   - Thêm `'reup:view' | 'reup:manage'` vào type `Permission`.
   - `ROLE_PERMISSIONS.SUPER_ADMIN` = mọi permission; `ADMIN` giữ nguyên danh sách cũ.
   - **`canAccessRoute()` dùng allowlist role cứng** ⇒ phải thêm `'SUPER_ADMIN'` vào
     **mọi** dòng đang có `'ADMIN'`:
     ```ts
     '/timeline': ['SUPER_ADMIN', 'ADMIN'],
     '/auto-post': ['SUPER_ADMIN', 'ADMIN'],
     ... (tất cả 10 route)
     '/reup': ['SUPER_ADMIN'],            // ← route mới, chỉ super-admin
     ```
     Bỏ sót ⇒ SUPER_ADMIN đăng nhập vào **không thấy menu nào**. Đây là lỗi dễ mắc nhất.
   - `defaultRouteFor()` phải trả route hợp lệ cho SUPER_ADMIN.
2. `frontend/src/utils/constants.ts` — `ROLE_LABELS` + `ROLE_COLORS` thêm key
   `SUPER_ADMIN` (`'Quản trị cấp cao'`, màu `'purple'`). Đây là `Record<UserRole, …>`
   nên thiếu key ⇒ **build đỏ**, không lọt được ra production.
3. `frontend/src/types/` — union `UserRole` thêm `'SUPER_ADMIN'`.

### 3.4 Ai được tạo SUPER_ADMIN

Chặn ở `users.service.ts`: **chỉ SUPER_ADMIN** mới được tạo/sửa user có role
`SUPER_ADMIN`. ADMIN cố tạo ⇒ `ForbiddenException` (403).

Không có luật này thì bất kỳ ADMIN nào cũng tự nâng mình lên SUPER_ADMIN, và cả plan
này trở thành trang trí.

Thêm luật thứ hai: **không được tự hạ role của chính mình** nếu mình là SUPER_ADMIN
cuối cùng đang `isActive` ⇒ `UnprocessableEntityException` (422). Tránh khoá chết hệ
thống, không còn ai vào được menu Reup.

### 3.5 Seed — tạo user SUPER_ADMIN **mới**

`prisma/seed.ts` tạo **thêm một user mới** role `SUPER_ADMIN`. **Không** nâng cấp user
admin sẵn có — giữ nguyên để còn kiểm chứng "ADMIN sau plan này làm được đúng như
trước" (§5) và để test phân quyền có đủ 2 vai đối chiếu.

```ts
// Email + mật khẩu lấy từ env, KHÔNG hardcode (rule 04, rule 01 §Bảo mật)
SEED_SUPER_ADMIN_EMAIL=superadmin@example.com
SEED_SUPER_ADMIN_PASSWORD=<đặt lúc chạy seed>
SEED_SUPER_ADMIN_NAME=Super Admin
```

Yêu cầu:
- **Idempotent** — `upsert` theo `email`; chạy seed lại không tạo user thứ hai, không
  ghi đè mật khẩu nếu user đã tồn tại.
- Mật khẩu bcrypt cost 12 (rule 01).
- **Không log mật khẩu** ra terminal. In đúng email + role, kèm dòng nhắc đổi mật khẩu
  sau lần đăng nhập đầu.
- Thiếu biến env bắt buộc ⇒ seed **dừng có thông báo rõ**, không tạo user mật khẩu mặc
  định kiểu `admin123`.

⇒ 3 biến trên phải thêm vào `.env.example` **cùng commit** (rule 04).

## 4. Task

**Backend**
- [x] `schema.prisma`: thêm `SUPER_ADMIN` vào enum `UserRole`
- [x] Migration `add_super_admin_role` + **cập nhật `erd.md`** (bảng Enum + Lịch sử) trong cùng thay đổi
- [x] `src/common/permissions.ts`: thêm `reup:view`/`reup:manage`, tách `ADMIN_PERMISSIONS` (C2)
- [x] `users.service.ts`: chặn ADMIN tạo/sửa role SUPER_ADMIN (403)
- [x] `users.service.ts`: chặn hạ role SUPER_ADMIN cuối cùng (422)
- [x] `prisma/seed.ts`: **tạo user SUPER_ADMIN mới** từ env, upsert idempotent, không log mật khẩu (§3.5)
- [x] `.env.example`: 3 biến `SEED_SUPER_ADMIN_*` (rule 04)
- [x] Rà `grep -rn "UserRole.ADMIN" src` — mọi chỗ so sánh role cứng phải xét cả SUPER_ADMIN
      (đã biết: `dashboard.service.ts`, `users.repository.ts`, `content-assets.service.ts`,
      `media-upload-jobs.*`)
- [x] Hỏi user rồi cập nhật `docs/05-rbac.md` §2 (rule 00 §1 — **không tự sửa**)

**Frontend**
- [x] `types/`: union `UserRole` thêm `'SUPER_ADMIN'`
- [x] `utils/permissions.ts`: type `Permission` + `ROLE_PERMISSIONS` + **`canAccessRoute` mọi route** (C1)
- [x] `utils/constants.ts`: `ROLE_LABELS` + `ROLE_COLORS`
- [x] `UserManagementPage.tsx`: select role thêm SUPER_ADMIN, chỉ hiện khi người đang đăng nhập là SUPER_ADMIN

**Test bắt buộc** (RBAC = vùng bắt buộc, rule 02)
- [x] `permissions.spec.ts`: SUPER_ADMIN có `reup:manage` · **ADMIN không có** `reup:view`
- [x] ADMIN vẫn giữ đủ mọi permission cũ (chống hồi quy — assert từng permission cũ)
- [x] `users.service.spec.ts`: ADMIN tạo user SUPER_ADMIN ⇒ 403
- [x] `users.service.spec.ts`: hạ role SUPER_ADMIN cuối cùng ⇒ 422
- [x] FE `utils/__tests__/permissions.spec.ts`: `canAccessRoute('SUPER_ADMIN', <mọi route>)` ⇒ true

**Chốt**
- [x] `npm run lint && npm run build` xanh cả BE và FE
- [x] `npm run test` xanh
- [x] `.env.example`: 3 biến seed mới
- [x] Cập nhật `contexts.md` §4 §5

## 5. Điều kiện nghiệm thu

- [x] `npm run seed` ⇒ tạo **user SUPER_ADMIN mới** `superadmin@example.com`; user
      `admin@company.local` **vẫn nguyên role ADMIN** (không bị nâng cấp — đúng §3.5);
      chạy seed **lần 2** ⇒ in "đã tồn tại — bỏ qua", **không** tạo dòng trùng, **không**
      ghi đè mật khẩu. Đã đối chiếu trực tiếp bảng `users` trên DB thật
- [x] Terminal khi seed **không** in mật khẩu (xác nhận trên output thật, cả 2 lần chạy)
- [ ] ⚠️ **CHƯA bấm tay** — Đăng nhập bằng user SUPER_ADMIN ⇒ thấy đầy đủ menu (C1).
      Phủ bằng unit test duyệt **mọi** route trong `RESTRICTED_ROUTES`, nhưng chưa smoke UI
- [ ] ⚠️ **CHƯA bấm tay** — Đăng nhập bằng ADMIN ⇒ làm được đúng mọi việc như trước.
      Phủ bằng test liệt kê từng permission cũ của ADMIN, nhưng chưa smoke UI
- [x] ADMIN gọi `POST /users` với `role: SUPER_ADMIN` ⇒ 403 (unit test)
- [x] Hạ role SUPER_ADMIN duy nhất xuống ADMIN ⇒ 422 (unit test)
- [x] `erd.md`: bảng Enum có `SUPER_ADMIN`, có dòng Lịch sử thay đổi

## 6. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|--------|-----------|
| R1 | Quên thêm SUPER_ADMIN vào `canAccessRoute` ⇒ super-admin trắng menu (C1) | Test FE duyệt **mọi** route trong map, không chỉ vài route mẫu |
| R2 | ADMIN vô tình nhận `reup:*` do `PERMISSIONS` là "tất cả" (C2) | Tách `ADMIN_PERMISSIONS` bằng filter + test khẳng định ADMIN **không** có `reup:view` |
| R3 | Hồi quy quyền ADMIN — sửa ma trận làm mất permission cũ | Test liệt kê từng permission cũ của ADMIN, không assert bằng `.length` |
| R4 | Enum Postgres: `ADD VALUE` không chạy trong transaction ở vài phiên bản | Để `ADD VALUE` **một mình** trong migration, không kèm DDL khác |
| R5 | Sửa `docs/05-rbac.md` vi phạm rule 00 §1 | Dừng, hỏi user, chỉ sửa khi user đồng ý; không thì ghi nợ `contexts.md` §6 |

---

## 7. Kết quả

- **Ngày xong:** 2026-08-15
- **File chính:**
  - BE: `prisma/schema.prisma` (enum), `prisma/migrations/20260815000000_add_super_admin_role/`,
    `src/common/permissions.ts` (+`isAdminLevel`), `src/modules/users/users.{service,repository,controller}.ts`,
    `prisma/seed.ts`, `.env.example`
  - BE (đổi theo role mới): `dashboard.service.ts`, `media-upload-jobs.{service,repository}.ts`,
    `content-assets.service.ts`
  - FE: `utils/permissions.ts` (+`RESTRICTED_ROUTES` export), `utils/constants.ts`,
    `types/index.ts`, `pages/UserManagementPage.tsx`
  - Docs: `erd.md` (Enum + Lịch sử), `docs/05-rbac.md` §1 §2 (user cho phép sửa)
- **Khác thiết kế ban đầu:**
  1. Thêm helper `isAdminLevel(role)` ở `common/permissions.ts` thay vì sửa rải rác 4 chỗ
     so `role === UserRole.ADMIN` — nếu không thì SUPER_ADMIN **kém quyền hơn** ADMIN
     (không tự duyệt được bài mình upload, không xem được số user, không retry được job
     người khác).
  2. `countActiveAdmins()` đếm **cả** SUPER_ADMIN + thêm `countActiveSuperAdmins()` riêng
     — xem `ISSUES-TO-REVIEW.md` mục I2.
  3. Chặn ADMIN **sửa/khoá** SUPER_ADMIN sẵn có, không chỉ chặn tạo (mục I3).
  4. `RESTRICTED_ROUTES` tách thành hằng **export được** để test duyệt toàn bộ key —
     plan §6 R1 đòi "test mọi route, không chỉ vài route mẫu", mà map nằm trong thân hàm
     thì test buộc phải liệt kê tay và sẽ mù với route thêm sau.
  5. `media-upload-jobs.repository.ts` liệt kê tay `'ADMIN'|'EDITOR'|'CONTENT'` ⇒ đổi sang
     dùng thẳng enum `UserRole` (đây là 6 lỗi biên dịch đầu tiên khi thêm role — chính là
     cạm bẫy C3 nhưng ở backend).
  6. Áp dụng `migrate deploy` thay `migrate dev` (mục I1).
- **Test:** BE **932 xanh (+16)** · FE **83 xanh (+16)**. Lint + build xanh cả 2 phía.
- **Còn nợ:**
  1. **Seed SUPER_ADMIN chưa chạy** — user phải thêm 2 biến `SEED_SUPER_ADMIN_*` vào
     `backend/.env` (mục I5). Đây là chặn duy nhất trước khi bấm tay được.
  2. **Chưa smoke UI** với tài khoản SUPER_ADMIN thật (phụ thuộc mục 1).
  3. `docs/05-rbac.md` §2 vẫn ghi EDITOR có `autopost:manage`/`timeline:view`/`dashboard:view`
     — **lệch code từ 2026-08-07**, không phải do plan này gây ra. Đã đánh dấu chú thích ¹
     trong docs thay vì tự sửa nội dung không thuộc phạm vi plan.
