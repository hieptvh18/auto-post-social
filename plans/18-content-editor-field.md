# Plan 18 — Cột "Editor" cho Quản lý Ảnh/Video

**Trạng thái:** 🟡 đang làm · Mở ngày 2026-08-03

## 1. Yêu cầu (user 2026-08-03)

Trang **Quản lý Ảnh/Video Edit**:

1. Thêm 1 trường **Editor** ở form thêm/sửa bài — chọn **account có role EDITOR**.
   Ý nghĩa: **video/ảnh này do ai dựng**, khác với "Người upload" đang có.
2. Trường này **optional** (không bắt buộc).
3. Phần filter của trang thêm select "Editor".
4. Role EDITOR: **dùng lại role sẵn có**, chỉ đổi label FE
   `Biên tập / Duyệt bài` → `Editor`.

## 2. Thiết kế

- DB: `content_assets.editor_id` **nullable** FK → `users.id`, relation
  `ContentEditor`. Index `[editor_id]` cho filter.
- Danh sách chọn: **chỉ user role=EDITOR và `is_active=true`**. `GET /users` gác
  `users:manage` (ADMIN) ⇒ CONTENT không gọi được ⇒ thêm endpoint riêng
  `GET /content-assets/editors` (mọi role đã đăng nhập), trả `{id,name,email}`.
- Validate ở service: `editorId` không tồn tại / không active / không phải EDITOR
  ⇒ **400**. Gửi `editorId: null` ⇒ gỡ editor.
- Ai được set: **mọi role sửa được bài đó** (không phải field duyệt) — CONTENT
  vẫn chỉ sửa bài của chính mình như cũ.

## 3. Task

### Backend
- [x] `schema.prisma`: `ContentAsset.editorId` + relation + index; `User.contentEditing`
- [x] Cập nhật `erd.md` (bảng, index, lịch sử thay đổi)
- [x] Migration `20260803..._content_assets_editor`
- [x] `UsersRepository.findActiveByRole()`
- [x] Repository: include `editor`, filter `editorId`, ghi khi create/update
- [x] Mapper: `editorId` + `editor`
- [x] DTO create/update/query
- [x] Service: validate editor + `GET /content-assets/editors`
- [x] Test: chọn editor hợp lệ · editor không phải EDITOR ⇒ 400 · editor bị khoá ⇒ 400 · gỡ editor bằng null

### Frontend
- [x] `types/index.ts`: `editor`/`editorId` trong `ContentAssetResponse` + payload + query
- [x] `contentAssets.api.ts` + hook `useEditorOptions`
- [x] Trang: cột "Editor", ô chọn trong Drawer sửa + Modal upload, filter select
- [x] `ROLE_LABELS.EDITOR` = `Editor`

## 4. Kết quả

- BE: 653 test xanh (+9 test mới cho Editor), lint + build xanh.
- FE: 35 test cũ xanh, lint + build xanh.
- Smoke API thật: editor bị khoá / role CONTENT / uuid sai ⇒ 400 · gán ⇒ response có
  `editor` (id/name/email) · `?editorId=` lọc đúng · gửi `null` ⇒ gỡ.
- Migration `20260803130538_content_assets_editor`, `erd.md` đã cập nhật.
- **Chưa bấm tay trên UI** — ghi nợ ở `contexts.md` §6 mục 24.
