# Plan 04 — Content Assets + duyệt + phân bổ page

**Milestone:** M3
**Trạng thái:** 🟡 (giai đoạn 1 + 2 code xong, chờ smoke test UI thật — giai đoạn 2
làm ở `plans/11-content-review-assignment-hashtags.md`, xem `contexts.md` §6)
**Phụ thuộc:** Plan 02, Plan 03
**Spec:** `docs/04-api-spec.md` §5, `docs/03-database-design.md` §5, `docs/05-rbac.md` §3

---

## 1. Mục tiêu

Trang "Quản lý Ảnh/Video" có backend đầy đủ: tạo content từ file đã upload, lọc/liệt
kê, sửa full-field, duyệt/không duyệt, tick Đạt ADS, phân bổ vào nhiều page —
tất cả qua **một** endpoint PATCH với kiểm quyền theo từng field.

**Chia 2 giai đoạn (chốt với user 2026-07-24):**

- **Giai đoạn 1 (làm trước):** CRUD cơ bản — tạo content từ file đã upload Drive,
  list có filter/phân trang, xem chi tiết, sửa field thường (title/description/
  category/caption/hashtags), xoá (kèm xoá file trên Drive). **Không** có duyệt
  (status luôn `PENDING_REVIEW`, không đổi qua API), **không** có `isAds`, **không**
  có phân bổ page. RBAC: CONTENT chỉ thao tác bài của chính mình; EDITOR/ADMIN thao
  tác mọi bài. Nối FE `ContentManagementPage` thay cho `MockDataContext` phần CRUD
  (ẩn tạm UI duyệt/isAds/phân bổ page khi `VITE_USE_MOCK=false`).
- **Giai đoạn 2 (làm sau, giữ nguyên thiết kế gốc bên dưới):** thêm transition
  status (duyệt/từ chối), `isAds`, phân bổ page (`assignedPageIds` + diff), RBAC
  field-level đầy đủ theo `content:review`. Task/case dưới đây **giữ nguyên** làm
  tài liệu cho giai đoạn 2; đánh dấu rõ task nào thuộc giai đoạn 1 khi tick.

## 2. Ngoài phạm vi

Bulk action, comment nhiều cấp, lịch sử phiên bản content.

## 3. Thiết kế

**Endpoint**

| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/content-assets` | filter: `status, mediaType, category, createdBy, isAds, search, from, to, page, limit` |
| GET | `/content-assets/:id` | kèm assignments + trạng thái đăng từng page |
| POST | `/content-assets` | luôn tạo ở `PENDING_REVIEW` |
| PATCH | `/content-assets/:id` | sửa + duyệt (endpoint duy nhất) |
| DELETE | `/content-assets/:id` | |

**Quy tắc quyền (service tự kiểm, ngoài `PermissionsGuard`)**

- Payload chứa `status` hoặc `isAds` ⇒ đòi `content:review` ⇒ CONTENT gọi ⇒ 403.
- CONTENT chỉ thao tác bài `createdById === user.id`, ngược lại 403.
- CONTENT sửa bài đang `REJECTED` ⇒ tự động về `PENDING_REVIEW`, xóa `rejectComment`.

**Transition** — bảng `docs/03` §5. Enforce trong `transitionStatus()`:

- Người dùng chỉ đi giữa `PENDING_REVIEW` / `APPROVED` / `REJECTED`.
- Client set `PUBLISHING`/`PUBLISHED` ⇒ **422** (chỉ Bot được set qua internal API).
- `→ REJECTED` thiếu `rejectComment` ⇒ 400.
- `→ APPROVED` ⇒ set `approvedById`, `updatedAt` tự cập nhật (là mốc xếp hàng cho Bot).

**Assignments** — `assignedPageIds: string[]`. Diff với hiện tại: thêm mới, xóa bớt.
Assignment **đã có `publishedAt` thì cấm xóa** ⇒ 409. Trùng (content, page) ⇒ 409
(bắt lỗi unique P2002 của Prisma).

## 4. Task

### Giai đoạn 1 — CRUD cơ bản (làm trước)

- [x] Repository: list có filter (mediaType, category, search, createdBy) + phân
      trang, detail, create, update (field thường), delete
- [x] `ContentAssetsService.create` — validate `driveFileId`/caption bắt buộc,
      status luôn `PENDING_REVIEW` mặc định (không nhận từ client), audit `CONTENT_UPLOAD`
- [x] `ContentAssetsService.update` — chỉ field thường (title/description/category/
      caption/hashtags); CONTENT chỉ sửa bài `createdById === user.id` ⇒ 403 nếu không
- [x] `ContentAssetsService.remove` — CONTENT chỉ xoá bài mình; xoá kèm file trên Drive
      (`DriveStorageFactory`); EDITOR/ADMIN xoá mọi bài
- [x] Scope list cho CONTENT: chỉ bài của mình (EDITOR/ADMIN thấy tất cả)
- [x] Audit `CONTENT_UPLOAD`, `CONTENT_UPDATE`, `CONTENT_DELETE`
- [x] DTO + Swagger đầy đủ (create/update/query)
- [x] Unit test cho RBAC ownership trong service: CONTENT sửa/xoá bài người khác ⇒ 403,
      CONTENT chỉ thấy bài của mình trong list, EDITOR/ADMIN thấy/sửa mọi bài
      (`content-assets.service.spec.ts`, 11 test)
- [x] `npm run lint && npm run build` xanh (`npm run test` 274 test xanh)
- [ ] Cập nhật `contexts.md`

### Giai đoạn 2 — Duyệt + isAds + phân bổ page (đã làm ở plan 11, 2026-07-25)

- [x] `ContentAssetsService.update` mở rộng — kiểm quyền field-level (`status`/`isAds`
      đòi `content:review`), `transitionStatus`, diff `assignedPageIds`
- [x] `transitionStatus()` tách riêng, thuần hàm, dễ test toàn bộ ma trận
- [x] `remove()` — chặn xóa bài đã có assignment `publishedAt != null`
- [x] Audit `CONTENT_STATUS_CHANGE`, `CONTENT_ADS_MARK`
- [x] Unit test **cho logic phức tạp/dễ sai** (không bắt buộc 100%): `transitionStatus()`
      (ma trận hợp lệ/không, reject thiếu lý do, client set PUBLISHED ⇒ 422), RBAC
      field-level, `diffAssignments` (409 khi trùng / xóa bài đã published), CONTENT
      sửa bài REJECTED → PENDING_REVIEW. CRUD thuần/mapper không cần test riêng.
- [x] `npm run lint && npm run build` xanh
- [x] Cập nhật `contexts.md`

## 4b. Nối frontend — ContentManagementPage

Làm ngay sau khi backend xanh, để test tay trên UI thật (yêu cầu MVP: BE + API
song song). Hạ tầng dùng chung đã có ở Plan 03b (`api/client.ts`, `AuthContext`).

### Giai đoạn 1

- [x] `src/api/contentAssets.api.ts`: list (đẩy filter lên query param), detail,
      create (gọi sau khi `mediaApi.upload` xong → `POST /content-assets`), `PATCH`
      (field thường), `DELETE`
- [x] `src/hooks/useContentAssets.ts`: query key + mutation, mọi mutation `invalidateQueries`
- [x] `ContentManagementPage`: tách `RealContentManagementPage` (API thật) vs
      `MockContentManagementPage` (giữ nguyên `MockDataContext`), chọn theo
      `env.useMock` (ADR-005); real component **ẩn tạm** UI trạng thái duyệt/
      `isAds`/phân bổ page (đợi giai đoạn 2); hiện lỗi bằng `message`
- [x] Type response đặt ở `src/types/`, đối chiếu Swagger
- [x] `npm run lint && npm run build` (frontend) xanh — **chưa test tay trên UI
      thật**, backend dev process đang chạy `dist/main` build cũ, cần restart để
      nạp route mới (`npm run start:dev` lại) rồi test CRUD thật trên `/content`

### Giai đoạn 2

- [x] Thêm lại UI trạng thái duyệt / `isAds` / phân bổ page, gọi `PATCH` mở rộng
- [x] `npm run lint && npm run build` (frontend) xanh

## 5. Điều kiện nghiệm thu

- [x] CONTENT tạo bài → `PENDING_REVIEW`, gán page (smoke curl 2026-07-25)
- [x] CONTENT gửi `{status:'APPROVED'}` ⇒ 403
- [x] EDITOR/ADMIN gửi `{status:'APPROVED', isAds:true}` ⇒ 200, `approvedBy` đúng, `updatedAt` mới
- [x] Gửi `{status:'REJECTED'}` không kèm lý do ⇒ 400
- [x] Bất kỳ ai gửi `{status:'PUBLISHED'}` ⇒ 422
- [x] Gán trùng page ⇒ 409 (unique P2002 đổi thành ConflictException)
- [ ] **Trên UI thật** (`VITE_USE_MOCK=false`): CONTENT tạo bài + upload → thấy trong
      danh sách; EDITOR duyệt → trạng thái đổi; lỗi 403/409 hiển thị đúng

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| `updatedAt` bị đổi bởi thao tác vặt ⇒ sai thứ tự hàng đợi Bot | Nhận diện sớm; nếu thành vấn đề thì thêm cột `approvedAt` riêng — ghi vào contexts.md §6 |
| Logic PATCH phình to khó test | Tách `transitionStatus`, `resolveFieldPermissions`, `diffAssignments` thành hàm thuần |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:**
- **Còn nợ:**
