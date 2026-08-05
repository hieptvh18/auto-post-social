# Plan 21 — Đăng nhiều ảnh trong một bài (album) theo mốc giờ

**Milestone:** Phase 2
**Trạng thái:** 🟡 đang làm
**Phụ thuộc:** plan 07 (auto-post engine), plan 20 (publisher)
**Spec tham chiếu:** `docs/03-database-design.md` §7 (picker), `docs/04-api-spec.md` §6

---

## 1. Mục tiêu

Mốc giờ đăng có thêm cấu hình **"Số ảnh/video trong 1 bài"** (`assetsPerPost`, mặc
định 1). Khi > 1, Bot lấy N tài nguyên **liên tiếp** trong danh mục (thứ tự
`updated_at ASC` — cũ trước, mới sau) và đăng thành **MỘT bài Facebook nhiều ảnh**
(album) thay vì N bài riêng lẻ.

## 2. Ngoài phạm vi

- **Album video:** Graph API không cho ghép nhiều video vào 1 bài feed. `assetsPerPost > 1`
  chỉ hợp lệ khi `mediaType = image` — chặn ở service (400), khoá ở UI.
- Đăng tay (`manual-post`) vẫn 1 bài = 1 tài nguyên, không đụng.
- Không đổi ngữ nghĩa `postCount` (số **bài** mỗi lần chạy). Tổng tài nguyên lấy ra
  mỗi lần chạy = `postCount × assetsPerPost`.
- Không sửa `docs/` (rule 00).

## 3. Thiết kế

### 3.1 Schema

```prisma
model AutoPostSlot {
  assetsPerPost Int @default(1) @map("assets_per_post")   // MỚI
}

/// Ảnh PHỤ của một bài album. Ảnh đầu tiên vẫn là publish_jobs.content_asset_id
/// (position 0) — bảng này chỉ chứa position >= 1.
model PublishJobAsset {
  id             String @id @default(uuid()) @db.Uuid
  publishJobId   String @map("publish_job_id") @db.Uuid
  contentAssetId String @map("content_asset_id") @db.Uuid
  position       Int
  @@unique([publishJobId, contentAssetId])
  @@unique([publishJobId, position])
  @@index([contentAssetId])
  @@map("publish_job_assets")
}
```

Vì sao **chỉ chứa ảnh phụ**: giữ nguyên `publish_jobs.content_asset_id` NOT NULL
⇒ toàn bộ query cũ (timeline, dashboard, monitor, đăng tay, retry) không phải sửa,
và không cần backfill migration cho job cũ. Giá phải trả: "danh sách asset của job"
= `[content_asset_id, ...publish_job_assets ORDER BY position]` — gói trong
repository, không nơi nào khác tự ghép.

### 3.2 Picker

Điều kiện loại trừ "content đang có job dở" phải **cộng thêm** bảng mới, nếu không
Bot sẽ chọn lại chính ảnh phụ của một album đang chờ đăng:

```sql
AND NOT EXISTS (SELECT 1 FROM publish_jobs j
                 WHERE j.content_asset_id = c.id AND j.facebook_page_id = $page
                   AND j.status IN ('QUEUED','PUBLISHING','FAILED'))
AND NOT EXISTS (SELECT 1 FROM publish_job_assets ja
                  JOIN publish_jobs j2 ON j2.id = ja.publish_job_id
                 WHERE ja.content_asset_id = c.id AND j2.facebook_page_id = $page
                   AND j2.status IN ('QUEUED','PUBLISHING','FAILED'))
```

Áp cho cả `pickForSlot` và `countByCategoryForPage` (con số trên UI phải khớp picker).

### 3.3 Scheduler

- `limit = postCount × assetsPerPost`.
- Cắt danh sách đã sắp xếp thành từng nhóm `assetsPerPost` phần tử; **nhóm cuối
  thiếu vẫn đăng** (còn 2 ảnh mà cấu hình 5 ⇒ đăng bài 2 ảnh, hơn là bỏ lại).
- Caption/hashtag của bài = của ảnh **đầu nhóm**.

### 3.4 Publish

- `FacebookPublisher.publishImageAlbum(input)`: upload từng ảnh vào `/{page}/photos`
  với `published=false` → gom `media_fbid` → `POST /{page}/feed` kèm `message` +
  `attached_media[i]`. Trả `post_id` của bài feed.
- Mỗi ảnh mượn file qua `MediaCacheService.withLocalFile` **tuần tự** (giữ 1 file
  trên tay mỗi lúc, RAM/đĩa phẳng như luồng 1 ảnh).
- `markPublishing` / `markSuccess` / `markFailure` phải áp cho **toàn bộ** asset của
  job (status content + `content_page_assignments.published_at` + `facebook_post_id`).

## 4. Task

- [x] `schema.prisma`: `assetsPerPost` + model `PublishJobAsset`
- [x] Cập nhật `erd.md` (bảng, index, enum, lịch sử) — **trước** khi migrate
- [x] Migration `add_album_post`
- [x] DTO create/update slot + validate `assetsPerPost` (1..MAX_ASSETS_PER_POST=10,
      >1 ⇒ bắt buộc `mediaType=image`)
- [x] Repository/mapper/service `auto-post-configs`
- [x] Picker: loại trừ thêm `publish_job_assets` (2 câu query)
- [x] Scheduler: limit × N + chia nhóm
- [x] `PublishJobsRepository`: tạo job kèm asset phụ, đọc asset của job, mark* theo nhóm
- [x] `FacebookPublisherClient.publishImageAlbum` + interface
- [x] `PublishMediaService`: nhánh album
- [x] FE: field "Số ảnh/video trong 1 bài" ở modal, cột bảng, type, mock
- [x] Unit test: picker loại ảnh phụ · scheduler chia nhóm · validate assetsPerPost ·
      publisher album · mark* nhiều asset
- [x] `npm run lint && npm run build` xanh 2 phía + `npm run test`
- [ ] Cập nhật `.env.example` (nếu thêm biến) — **không thêm biến**, MAX_ASSETS_PER_POST
      là hằng số trong code
- [x] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [ ] Mốc giờ `assetsPerPost=3`, danh mục có ≥3 ảnh ⇒ Facebook hiện **1 bài 3 ảnh**,
      đúng thứ tự cũ→mới.
- [ ] Cả 3 ảnh chuyển `PUBLISHED`, cả 3 assignment có `published_at` + `facebook_post_id`.
- [ ] Tick lại mốc đó ⇒ không chọn lại 3 ảnh vừa đăng.
- [ ] `assetsPerPost > 1` + `mediaType = video/all` ⇒ 400 với message rõ ràng.

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Upload xong vài ảnh unpublished rồi lỗi ⇒ ảnh rác trên page | Ảnh `published=false` không lên tường; log id để dọn tay nếu cần |
| Job album FAILED giữ cả N ảnh khỏi diện pick | Đúng ý đồ (giống job 1 ảnh) — muốn đăng lại thì bấm "Đăng lại" |
| Quên loại ảnh phụ khỏi picker ⇒ đăng trùng | Test bắt buộc ở §4 |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:** 2026-08-06 (code xong, **chưa test tay trên UI/Page thật**)
- **File chính:** `backend/prisma/schema.prisma` (migration `20260805170928_album_post`),
  `backend/src/modules/auto-post-configs/{auto-post-configs.service,auto-post-config.mapper,
  auto-post-configs.repository,dto/*}.ts`,
  `backend/src/modules/auto-post/{auto-post-scheduler.service,content-picker.repository}.ts`,
  `backend/src/modules/publish-jobs/{publish-jobs.repository,publish-jobs.service,
  publish-executor.service,publish-media.service}.ts`,
  `backend/src/infra/facebook/facebook-publisher.{client,interface}.ts`,
  `frontend/src/pages/AutoPostSettingsPage.tsx`, `frontend/src/types/index.ts`
- **Khác thiết kế ban đầu:** không. Giữ đúng phương án "bảng chỉ chứa ảnh phụ".
- **Test:** BE 735 xanh (+20: picker loại ảnh phụ, scheduler chia nhóm/nhóm cuối thiếu,
  validate assetsPerPost×mediaType, publisher album 2 pha, executor mark\* nhiều asset);
  FE 41 test cũ xanh. lint/build 2 phía xanh.
- **Còn nợ:** nghiệm thu §5 phải bấm tay trên UI + Page thật (chưa làm ở session này).
