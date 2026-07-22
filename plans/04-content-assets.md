# Plan 04 — Content Assets + duyệt + phân bổ page

**Milestone:** M3
**Trạng thái:** ⬜
**Phụ thuộc:** Plan 02, Plan 03
**Spec:** `docs/04-api-spec.md` §5, `docs/03-database-design.md` §5, `docs/05-rbac.md` §3

---

## 1. Mục tiêu

Trang "Quản lý Ảnh/Video" có backend đầy đủ: tạo content từ file đã upload, lọc/liệt
kê, sửa full-field, duyệt/không duyệt, tick Đạt ADS, phân bổ vào nhiều page —
tất cả qua **một** endpoint PATCH với kiểm quyền theo từng field.

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

- [ ] Repository: list có filter + phân trang, detail kèm assignments, CRUD
- [ ] `ContentAssetsService.create` — validate `driveFileId`, caption bắt buộc,
      tạo assignments, audit `CONTENT_UPLOAD`
- [ ] `ContentAssetsService.update` — kiểm quyền field-level, transition, diff assignments
- [ ] `transitionStatus()` tách riêng, thuần hàm, dễ test toàn bộ ma trận
- [ ] `remove()` — CONTENT chỉ xóa bài mình; chặn xóa bài đã có assignment published
- [ ] Scope list cho CONTENT: chỉ bài của mình
- [ ] Audit `CONTENT_STATUS_CHANGE`, `CONTENT_ADS_MARK`
- [ ] DTO + Swagger đầy đủ
- [ ] Unit test 100%, bắt buộc phủ các case ở `.claude/rules/02-testing.md`
      (transition hợp lệ/không, reject thiếu lý do, RBAC field-level, assignment 409,
      CONTENT sửa bài REJECTED → PENDING_REVIEW)
- [ ] `npm run lint && npm run test:cov && npm run build` xanh
- [ ] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [ ] CONTENT tạo bài → `PENDING_REVIEW`, gán 2 page
- [ ] CONTENT gửi `{status:'APPROVED'}` ⇒ 403
- [ ] EDITOR gửi `{status:'APPROVED', isAds:true}` ⇒ 200, `approvedBy` đúng, `updatedAt` mới
- [ ] EDITOR gửi `{status:'REJECTED'}` không kèm lý do ⇒ 400
- [ ] Bất kỳ ai gửi `{status:'PUBLISHED'}` ⇒ 422
- [ ] Gán trùng page ⇒ 409

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
