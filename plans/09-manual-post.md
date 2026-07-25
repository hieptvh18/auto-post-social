# Plan 09 — Đăng bài thủ công + filter page (trang Cài đặt đăng bài tự động)

**Milestone:** bổ sung cho M5 (yêu cầu user 2026-07-25)
**Trạng thái:** 🟡
**Phụ thuộc:** Plan 04 (content-assets), Plan 05 (facebook-pages + adapter Graph), Plan 06
**Spec liên quan:** `docs/07-facebook-publisher.md`, `docs/03-database-design.md` §7

---

## 1. Mục tiêu

Trên trang **Cài đặt đăng bài tự động**:

1. **Filter theo FB Page** — danh sách page nhiều thì chỉ xem cấu hình của 1 page.
2. **Nút "Đăng bài thủ công"** → popup: chọn page → lọc danh mục/loại media → chọn
   1 bài (ảnh/video) đã có trong kho → sửa caption/hashtag lấy sẵn từ bài → Submit
   ⇒ **đăng ngay lập tức** qua Meta Graph API (không qua cron, không qua queue).

Đây là đường chạy thật đầu tiên của luồng publish — dùng để nghiệm thu token/Drive/Graph
trước khi làm engine tự động ở Plan 07.

## 2. Ngoài phạm vi

- Không làm cron/queue/retry (Plan 07). Đăng thủ công là **đồng bộ**, user chờ kết quả.
- Không lên lịch đăng sau (`scheduleTime` = thời điểm bấm nút).
- Không sửa caption gốc của content: caption/hashtag chỉnh trong popup chỉ áp cho
  **lần đăng này** và được lưu trong `publish_jobs.caption/hashtags` để truy vết.
- Không đăng nhiều bài/nhiều page một lần (1 submit = 1 bài × 1 page).

## 3. Thiết kế

### 3.1 Backend — module `manual-post`

| Method | Path | Quyền | Ghi chú |
|--------|------|-------|---------|
| POST | `/manual-post` | `autopost:manage` (ADMIN + EDITOR) | đăng ngay, trả kết quả job |

Body: `{ pageId (uuid FacebookPage), contentAssetId (uuid), caption, hashtags? }`.

Luồng (`ManualPostService.publishNow`):

```text
1. Load content (404) + page (404, page đã xoá coi như không tồn tại)
2. Page tạm dừng (isActive=false) ⇒ 400 — không đăng lên page đang tắt
3. Assignment (content,page) đã có publishedAt ⇒ 409 (rule mỗi bài 1 lần / 1 page)
4. Tạo publish_job status=PUBLISHING, createdBy = tên user (khác Bot)
5. Drive.createReadStream(driveFileId) → buffer
6. FacebookPublisher.publishImage|publishVideo(pageId, token, message, file)
7. OK  : transaction → job SUCCESS + facebookPostId + publishedAt
                     → assignment upsert publishedAt + facebookPostId
                     → content.status = PUBLISHED
         audit MANUAL_PUBLISH
   Lỗi : job FAILED + errorMessage (không đụng content/assignment) ⇒ 502 kèm message Graph
```

`PUBLISHED` do **server** set sau khi Graph trả post id — không phải client gửi lên,
nên vẫn đúng rule "client không được tự set PUBLISHING/PUBLISHED".

### 3.2 Adapter publisher (`src/infra/facebook/facebook-publisher.*`)

- Ảnh: `POST /{pageId}/photos` (`source` multipart, `caption`, `published=true`).
- Video: `POST /{pageId}/videos` trên host `graph-video.facebook.com`
  (`source` multipart, `description`).
- Token đi bằng header `Authorization: Bearer` như adapter hiện có, không qua query.
- Timeout: ảnh 60s, video 180s. Lỗi Graph → `mapFacebookError` (dùng lại).
- File nạp vào RAM (Blob) — chấp nhận được vì đã bị chặn bởi `maxUploadMb` lúc upload
  Drive; ghi nợ resumable upload cho video lớn.

### 3.3 Frontend

- `api/manualPost.api.ts` + `hooks/useManualPost.ts`.
- `components/autopost/ManualPostModal.tsx`: chọn page → danh mục → loại media →
  danh sách bài (dùng `useContentAssets` sẵn có) → caption/hashtag prefill, sửa được.
- `AutoPostSettingsPage`: thêm `Select` filter page + nút "Đăng bài thủ công"
  (header) và nút "Đăng ngay" trên từng card (prefill page đó).
- Bản Mock: có filter page; nút đăng thủ công disable kèm tooltip (mock không gọi API thật).

## 4. Task

- [x] `facebook-publisher.interface.ts` + `facebook-publisher.client.ts` (ảnh/video)
- [x] `manual-post.repository.ts` (publish job + assignment + content status trong transaction)
- [x] `manual-post.service.ts` + `dto/create-manual-post.dto.ts` + controller + module
- [x] Audit action `MANUAL_PUBLISH`
- [x] Đăng ký module vào `app.module.ts`
- [x] Unit test service (vùng dễ sai: 409 trùng, page tạm dừng, job FAILED khi Graph lỗi,
      chọn đúng publishImage/publishVideo theo mediaType, không đụng content khi lỗi)
- [x] `npm run lint && npm run test && npm run build` (backend) xanh
- [x] FE: api + hook + modal + filter page trên `AutoPostSettingsPage` + types
- [x] `npm run lint && npm run build` (frontend) xanh
- [x] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [x] Không đụng schema ⇒ `erd.md` không đổi
- [ ] **Chạy thật**: chọn 1 ảnh trong kho → đăng lên page thật → bài lên Facebook,
      job SUCCESS, assignment có `facebookPostId`, content chuyển `PUBLISHED`
      — **CHƯA LÀM**: cần Page token thật (nợ §6 mục 10 của `contexts.md`)
- [ ] Đăng lại chính bài đó lên cùng page ⇒ 409 (chạy thật)
- [x] CONTENT gọi `POST /manual-post` ⇒ 403 (guard `autopost:manage`)

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Video lớn ⇒ giữ nguyên file trong RAM + timeout Graph | Giới hạn `maxUploadMb` lúc upload; timeout 180s; ghi nợ resumable upload |
| User bấm 2 lần ⇒ đăng trùng | Nút disable khi đang gửi; đăng lần 2 bị chặn bởi assignment `publishedAt` ⇒ 409 |
| Token page hết hạn | Message lỗi Graph trả thẳng lên popup (đã map tiếng Việt) |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:** 2026-07-25 (code + unit test; chờ chạy thật với Page token)
- **File chính:** `backend/src/infra/facebook/facebook-publisher.{interface,client}.ts`,
  `backend/src/modules/manual-post/`, `frontend/src/api/manualPost.api.ts`,
  `frontend/src/hooks/useManualPost.ts`,
  `frontend/src/components/autopost/ManualPostModal.tsx`,
  `frontend/src/pages/AutoPostSettingsPage.tsx`
- **Khác thiết kế ban đầu:** điền sau khi chạy thật.
- **Còn nợ:** chưa đăng thật lên page (thiếu Page token — `contexts.md` §6 mục 10).
