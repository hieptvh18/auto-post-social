# Reup — Tóm tắt hệ thống (đọc nhanh)

> File này chỉ để **tra cứu nhanh** luồng xử lý. Chi tiết thiết kế/task/test xem từng
> file `NN-*.md`; bản đồ phụ thuộc xem [README.md](./README.md).
> Cập nhật lần cuối: 2026-08-16 (theo trạng thái plan 26-33).

## 1. Reup là gì

Tự động tìm video trending theo **chủ đề** người vận hành khai báo (nguồn: YouTube),
tải về, đẩy lên Google Drive, tạo bài trong kho nội dung (`content_assets`), để
**auto-post engine hiện có** (không sửa gì) tự nhặt và đăng lên Facebook Page — sau đó
tự dọn file đã đăng để không phình dung lượng Drive.

Nói gọn: **Reup = một "nguồn cấp bài" tự động, ngồi trước auto-post engine.**

## 2. Luồng xử lý end-to-end

```text
┌─ SUPER_ADMIN khai báo chủ đề (/reup) ──────────────────────────────────┐
│  ReupTopic: tên · platform(YOUTUBE) · keywords · category · dailyQuota │
│  (mặc định 3) · minView/maxAge/duration · autoApprove · isActive       │
└──────────────────────────────────────────────────────────────────────┬─┘
                                                                        │
   Cron A "reup-discovery"  @02:00 Asia/Ho_Chi_Minh (giờ đổi được ở UI) │
   claim reup_runs UNIQUE(topic_id, run_date) ← chống chạy trùng        │
                                                                        ▼
   YouTube Data API v3 search.list → lọc: đã có externalId? · view thấp?
   · duration sai? · quá cũ? → chọn top N = dailyQuota
                                                                        │
   INSERT reup_videos (PENDING) ──► enqueue BullMQ "reup-download"     │
                                                                        ▼
   ReupDownloadProcessor: spawn Python (ai-video-downloader, process con)
   → yt-dlp tải file .mp4 về đĩa server (thư mục riêng theo job)
                                                                        │
   Tạo MediaUploadJob(source=REUP) ──► dùng lại pipeline upload có sẵn │
   → Google Drive → content_assets (source_type=REUP,                  │
     status = autoApprove ? APPROVED : PENDING_REVIEW)                 │
                                                                        ▼
                    ┌───────────────────────────────────┐
                    │  Auto-post engine hiện tại — KHÔNG SỬA │
                    │  tự nhặt bài APPROVED, đăng lên Page   │
                    └───────────────────────────────────┘
                                                                        │
   Cron "reup-cleanup" @03:00 — bài REUP đã PUBLISHED > N ngày (mặc     │
   định 7), không còn job SCHEDULED/QUEUED/PUBLISHING nào               ▼
   → xoá file trên Drive, GIỮ NGUYÊN record (content_assets, publish_jobs,
     insight) — chỉ set resource_deleted_at, để Bot không nhặt lại
```

Mọi sự kiện trên (tạo/sửa chủ đề, cron quét, video import/fail, cron dọn, xoá tay)
đều ghi vào **Audit Logs** (nhóm action `REUP_*`) — chỉ SUPER_ADMIN nhìn thấy.

## 3. Các mảnh ghép chính & trạng thái

| # | Plan | Việc | Trạng thái |
|---|---|---|---|
| 26 | [role SUPER_ADMIN](./26-super-admin-role.md) | Role mới + permission `reup:view`/`reup:manage` | ✅ xong 2026-08-15 |
| 27 | [schema + màn cấu hình](./27-reup-schema-topics.md) | 3 bảng (`reup_topics/videos/runs`) + CRUD chủ đề + lọc `sourceType` ở kho | ✅ xong 2026-08-15 |
| 28 | [cầu nối Python](./28-downloader-bridge.md) | NestJS ⇄ `ai-video-downloader` qua spawn process, search + tải 1 video | ✅ xong 2026-08-15 |
| 29 | [cron pipeline](./29-reup-cron-pipeline.md) | Cron tìm→tải→Drive→content_assets tự động, nối `MediaUploadJob` | ✅ xong 2026-08-16 |
| 30 | [cleanup](./30-reup-cleanup.md) | Cron xoá file đã đăng, giữ record, sửa picker auto-post (`resource_deleted_at`) | ✅ xong 2026-08-16 |
| 31 | [audit log](./31-audit-log-reup.md) | 12 action `REUP_*`, chỉ SUPER_ADMIN thấy, chặn rò rỉ qua dropdown/API | ⬜ chưa làm |
| 32 | [giờ chạy cron từ UI](./32-reup-cron-config.md) | Đổi giờ 02:00/03:00 không cần deploy lại (`SchedulerRegistry`) | 🟡 code+test xong 2026-08-16, chưa bấm tay |
| 33 | [gộp Queue Monitor](./33-unified-queue-monitor.md) | `/queue` + `/failed` thấy đủ 4 queue (publish/media-upload/drive-import/reup) | ⬜ chưa làm |

**Việc lớn còn thiếu để chạy thật hết pipeline:** chưa có `REUP_PYTHON_BIN` /
`REUP_PROJECT_DIR` / API key YouTube thật trong `.env` của môi trường chạy — toàn bộ
logic đã có unit test đầy đủ nhưng **chưa từng chạy end-to-end thật** (quét → tải →
Drive → đăng lên Page thật). Xem `ISSUES-TO-REVIEW.md` mục V1.

## 4. Dữ liệu chính (bảng mới)

| Bảng | Vai trò |
|---|---|
| `reup_topics` | Chủ đề do người vận hành khai báo (keyword, bộ lọc, quota/ngày, autoApprove) |
| `reup_videos` | Mỗi video nguồn phát hiện được. `UNIQUE(platform, external_id)` = chống tải trùng |
| `reup_runs` | Nhật ký 1 lượt cron chạm 1 chủ đề. `UNIQUE(topic_id, run_date)` = chống chạy trùng/ngày |
| `content_assets` (+2 cột) | `source_type` (MANUAL/REUP) tách 2 menu · `resource_deleted_at` = đã dọn file (plan 30) |

## 5. Quyết định kiến trúc quan trọng (không mở lại khi code)

- **Python chạy như process con** (spawn), không phải HTTP service — nhu cầu chỉ 2-3
  video/ngày, không đáng dựng thêm service. Đổi sau chỉ sửa 1 file adapter.
- **`ai-video-downloader` là phụ thuộc tuỳ chọn** — thiếu cấu hình thì backend vẫn boot
  bình thường, chỉ tính năng reup tự tắt (`SKIPPED/DOWNLOADER_UNAVAILABLE`, 1 dòng WARN).
- **Dùng lại `MediaUploadJob`** để lên Drive, không viết đường ống thứ hai.
- **Chỉ implement YouTube** (Douyin/TikTok lưu được nhưng bị `SKIPPED`).
- **Mặc định `PENDING_REVIEW`**, cờ `autoApprove` mới cho đăng thẳng không qua duyệt.
- **Không sửa auto-post engine** — ngoại lệ duy nhất: thêm điều kiện
  `resource_deleted_at IS NULL` vào picker (plan 30).
- **RBAC chặn ở service, không phải chỉ ẩn UI**: role thiếu `reup:view` gọi thẳng API
  vẫn không lấy được bài/log/video REUP nào (ép cứng MANUAL, trả 404/rỗng thay vì 403).

## 6. Cạm bẫy đã biết (đọc trước khi đụng vào phần liên quan)

| # | Cạm bẫy | Ở plan |
|---|---|---|
| C1 | `canAccessRoute()` FE dùng allowlist role cứng — quên thêm SUPER_ADMIN là mất menu | 26 |
| C7/C8 | Lọc `sourceType` đặt sai chỗ (repository chung/Prisma middleware) ⇒ Bot không nhặt được bài reup, Dashboard đếm thiếu — hỏng âm thầm | 27 |
| C4/C5 | stdout Python lẫn log ⇒ JSON.parse nổ; thư mục tải phải duy nhất theo job | 28 |
| C6 | Xoá file khi còn `publish_job` chưa xong ⇒ đăng vào hư không | 30 |
| C9 | `distinctActions()` đổ dropdown từ dữ liệu thật — quên lọc thì tên action tự lộ tính năng | 31 |
| C10 | Biến `REUP_*` là **ngoại lệ** — không được validate crash lúc boot như các biến khác | 28 |

Danh sách đầy đủ + lý do: [README.md §5](./README.md).

## 7. Còn nợ đáng chú ý

1. Plan 31 (audit log reup) và plan 33 (gộp Queue Monitor) — chưa code.
2. Plan 32 — code+test xanh nhưng chưa bấm tay đổi giờ cron trên môi trường thật.
3. Chưa có API key YouTube thật + đường dẫn `ai-video-downloader` trong `.env` ⇒ toàn bộ
   pipeline discovery→download→Drive→auto-post **chưa chạy thật lần nào**, chỉ có unit
   test + vài lần đo tay từng mảnh rời (tải 1 video thật, boot app không lỗi...).
4. Select "Loại" (Manual/Reup) ở form thêm bài trong màn Quản lý Ảnh/Video — backend đã
   hỗ trợ, FE chưa làm (plan 27, mục I8 trong `ISSUES-TO-REVIEW.md`).
