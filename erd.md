# ERD — Tool Auto FB

> **Bản đồ dữ liệu chính thức.** Mọi thay đổi schema PHẢI cập nhật file này —
> xem [.claude/rules/05-database-erd.md](./.claude/rules/05-database-erd.md).

**Cập nhật:** 2026-08-06
**Migration tương ứng:** `20260806*_content_asset_files` (plan 22)
**Nguồn sự thật:** `backend/prisma/schema.prisma`

---

## 1. Sơ đồ

```mermaid
erDiagram
    users ||--o{ content_assets : "creates (created_by)"
    users ||--o{ content_assets : "approves (approved_by)"
    users ||--o{ content_assets : "last edits (updated_by)"
    users ||--o{ content_assets : "edits media (editor_id)"
    users ||--o{ facebook_pages : creates
    users ||--o{ facebook_connections : "connects fb account"
    facebook_connections ||--o{ facebook_pages : "supplies token to"
    users ||--o{ audit_logs : performs
    users ||--o{ app_settings : "last updated by"
    content_assets ||--o{ content_page_assignments : "assigned to"
    facebook_pages ||--o{ content_page_assignments : receives
    content_assets ||--o{ publish_jobs : has
    facebook_pages ||--o{ publish_jobs : targets
    facebook_pages ||--o{ auto_post_slots : schedules
    auto_post_slots ||--o{ slot_runs : "fired as"
    publish_jobs ||--o{ publish_job_events : "logs attempts"
    content_assets ||--o{ content_asset_files : "has extra images"

    users {
        uuid id PK
        string name
        string email UK
        string password_hash
        enum role
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    facebook_pages {
        uuid id PK
        string page_name
        string page_id UK
        text access_token_enc
        timestamp token_expire_at
        boolean is_active
        boolean autopost_enabled
        timestamp deleted_at
        enum connect_mode
        uuid connection_id FK
        uuid created_by FK
        timestamp created_at
        timestamp updated_at
    }

    facebook_connections {
        uuid id PK
        string fb_user_id UK
        string fb_user_name
        text user_token_enc
        timestamp token_expire_at
        string_array scopes
        timestamp revoked_at
        uuid connected_by FK
        timestamp created_at
        timestamp updated_at
    }

    content_assets {
        uuid id PK
        string title
        text description
        text caption
        text hashtags
        string category
        enum media_type
        string drive_file_id
        string drive_url
        string thumbnail_url
        string mime_type
        bigint file_size
        enum status
        boolean is_ads
        boolean is_active
        text reject_comment
        uuid created_by FK
        uuid approved_by FK
        uuid updated_by FK
        uuid editor_id FK
        timestamp created_at
        timestamp updated_at
    }

    content_page_assignments {
        uuid id PK
        uuid content_asset_id FK
        uuid facebook_page_id FK
        timestamp published_at
        string facebook_post_id
        timestamp created_at
    }

    auto_post_slots {
        uuid id PK
        uuid facebook_page_id FK
        string time
        string_array categories
        enum media_type
        int post_count
        boolean enabled
        timestamp created_at
        timestamp updated_at
    }

    slot_runs {
        uuid id PK
        uuid slot_id FK
        string run_date
        string run_time
        enum status
        int picked_count
        int job_created_count
        string skip_reason
        timestamp started_at
        timestamp finished_at
        text error_message
        timestamp created_at
    }

    publish_jobs {
        uuid id PK
        uuid content_asset_id FK
        uuid facebook_page_id FK
        text caption
        text hashtags
        timestamp schedule_time
        enum status
        timestamp published_at
        string facebook_post_id
        text error_message
        int attempt_count
        string bull_job_id
        string created_by
        timestamp created_at
        timestamp updated_at
    }

    content_asset_files {
        uuid id PK
        uuid content_asset_id FK
        int position
        string drive_file_id
        string drive_url
        string thumbnail_url
        string mime_type
        bigint file_size
        timestamp created_at
    }

    publish_job_events {
        uuid id PK
        uuid publish_job_id FK
        int attempt_no
        enum event
        text message
        jsonb raw_error
        timestamp created_at
    }

    app_settings {
        string key PK
        jsonb value
        uuid updated_by FK
        timestamp created_at
        timestamp updated_at
    }

    audit_logs {
        uuid id PK
        uuid user_id FK
        string action
        string resource
        jsonb before_value
        jsonb after_value
        string ip_address
        timestamp created_at
    }
```

---

## 2. Enum

| Enum | Giá trị | Dùng ở |
|------|---------|--------|
| `UserRole` | `ADMIN` · `EDITOR` · `CONTENT` | `users.role` |
| `MediaType` | `image` · `video` | `content_assets.media_type` |
| `SlotMediaType` | `image` · `video` · `all` | `auto_post_slots.media_type` |
| `ContentStatus` | `PENDING_REVIEW` · `APPROVED` · `REJECTED` · `PUBLISHING` · `PUBLISHED` | `content_assets.status` |
| `PublishStatus` | `SCHEDULED` · `QUEUED` · `PUBLISHING` · `SUCCESS` · `FAILED` · `CANCELLED` | `publish_jobs.status` |
| `SlotRunStatus` | `CLAIMED` · `DONE` · `SKIPPED` · `ERROR` | `slot_runs.status` |
| `PublishJobEventType` | `ENQUEUED` · `STARTED` · `SUCCEEDED` · `FAILED` · `RETRY_SCHEDULED` · `GAVE_UP` | `publish_job_events.event` |
| `FacebookConnectMode` | `MANUAL_TOKEN` · `FB_LOGIN` | `facebook_pages.connect_mode` |

---

## 3. Index & Unique

| Bảng | Index | Lý do |
|------|-------|-------|
| `users` | UNIQUE `email` | Định danh đăng nhập |
| `facebook_pages` | UNIQUE `page_id` | Định danh phía Meta |
| `facebook_pages` | `is_active` | Lọc page đang dùng (đang bật, chưa tạm dừng) |
| `facebook_pages` | `deleted_at` | Lọc page chưa bị xoá — điều kiện mặc định của mọi truy vấn nghiệp vụ |
| `facebook_pages` | `connection_id` | Lấy mọi page của một kết nối khi đồng bộ / ngắt kết nối |
| `facebook_connections` | UNIQUE `fb_user_id` | Một tài khoản Facebook chỉ có 1 kết nối — đăng nhập lại là cập nhật dòng cũ, không đẻ dòng mới |
| `facebook_connections` | `revoked_at` | Lọc kết nối còn hiệu lực |
| `content_assets` | **`(status, is_active, updated_at)`** | **Cron picker: APPROVED + đang dùng, order `updated_at ASC`** (thay index `(status, updated_at)` cũ) |
| `content_assets` | `is_active` | Lọc "Đang dùng / Ngưng dùng" ở trang quản lý |
| `content_assets` | `status` · `category` · `media_type` · `created_by` · `is_ads` | Bộ lọc trang quản lý + dashboard |
| `content_assets` | `editor_id` | Bộ lọc "Editor" (người dựng video) trên trang Quản lý Ảnh/Video |
| `content_page_assignments` | **UNIQUE `(content_asset_id, facebook_page_id)`** | **Mỗi bài chỉ đăng 1 lần trên 1 page** |
| `content_page_assignments` | `(facebook_page_id, published_at)` | Thống kê bài đã đăng theo page |
| `auto_post_slots` | `(facebook_page_id, enabled)` | Cron quét slot đến giờ |
| `slot_runs` | **UNIQUE `(slot_id, run_date, run_time)`** | **Chống cron double-fire (ADR-006)** — claim bằng INSERT, bắt P2002 |
| `slot_runs` | `(run_date, status)` | Xem nhật ký cron theo ngày / lọc slot bị SKIPPED–ERROR |
| `publish_job_events` | `(publish_job_id, created_at)` | Đọc nhật ký từng lần thử của một job theo thứ tự thời gian |
| `publish_jobs` | `status` · `schedule_time` | Queue monitor + timeline |
| `publish_jobs` | `(content_asset_id, facebook_page_id)` | Kiểm tra job trùng trong picker |
| `content_asset_files` | **UNIQUE `(content_asset_id, position)`** | Thứ tự ảnh trong bài là duy nhất, không nhập nhằng khi đăng album |
| `content_asset_files` | `content_asset_id` | Lấy toàn bộ ảnh phụ của một bài lúc đăng và lúc mở Drawer chi tiết |
| `audit_logs` | `user_id` · `action` · `created_at` | Truy vết |
| `app_settings` | PK `key` | Số dòng rất nhỏ (1 dòng/nhóm config), tra bằng khoá chính là đủ — không cần index phụ |

---

## 4. Ràng buộc nghiệp vụ (sơ đồ không diễn tả được)

| Ràng buộc | Nơi enforce |
|-----------|-------------|
| Mỗi content chỉ đăng **1 lần / 1 page** | UNIQUE `(content_asset_id, facebook_page_id)` + `published_at IS NULL` trong picker |
| `PUBLISHING` / `PUBLISHED` chỉ Bot được set | `ContentAssetsService.transitionStatus()` — client set ⇒ 422 |
| `status = REJECTED` bắt buộc có `reject_comment` | Service (400 nếu thiếu) |
| `content_assets.caption` bắt buộc (Bot dùng khi đăng) | DB NOT NULL + DTO |
| `auto_post_slots.time` = `'HH:mm'` theo `Asia/Ho_Chi_Minh` | DTO regex + comment trong entity |
| Không trùng `time` trong cùng một page | Service (409) |
| `access_token_enc` luôn là ciphertext AES-256-GCM | `crypto.util.ts`; API trả bản mask |
| Mọi timestamp lưu **UTC** | Prisma mặc định; UI convert sang `Asia/Ho_Chi_Minh` |
| `content_assets.updated_at` = mốc xếp hàng cho Bot (thời điểm duyệt gần nhất) | `@updatedAt` |
| `content_assets.is_active` = **bài còn được đem ra dùng không**, độc lập với `status` (duyệt). `false` ⇒ Bot **không lấy nữa**, nhưng **không** gỡ bài đã đăng và không đụng `publish_jobs`. Mọi nơi *tiêu thụ* bài (cron picker, đếm kho, đăng tay, lịch đăng, dashboard) phải lọc `is_active = TRUE`; riêng `GET /content-assets` **cố ý không lọc** vì đó là màn quản kho | Picker raw SQL + `ContentAssetsService`; xem `plans/19-bulk-actions.md` §2.2 |
| `content_assets.editor_id` = người **dựng** video/ảnh (account role `EDITOR`, đang active). Khác hẳn `created_by` (người upload) và `updated_by` (người sửa gần nhất). Nullable — không bắt buộc. Ràng buộc "phải là EDITOR + active" kiểm ở **service**, DB chỉ ràng FK | `ContentAssetsService.assertEditorSelectable()` |
| `content_assets.updated_by` = người **sửa gần nhất** (không phải người duyệt — đó là `approved_by`). `null` = bài cũ có trước khi bật tracking | `ContentAssetsService.create()/update()` set `= actor.id` |
| Xóa page = soft delete (`deleted_at = now()`, kèm `is_active=false`) | Service — vì `publish_jobs` còn tham chiếu. **`deleted_at` (đã xoá, ẩn khỏi UI) khác `is_active` (tạm dừng, vẫn hiện ở UI)** — không dùng lẫn |
| Page có `deleted_at != null` coi như không tồn tại (list ẩn, GET/PUT/DELETE ⇒ 404, publisher không lấy được token) | `FacebookPagesRepository` lọc `deleted_at: null` ở `findMany`/`findById` |
| Thêm lại page có `page_id` đã bị xoá mềm ⇒ **hồi sinh** bản ghi cũ (không 409, không tạo dòng mới) | `FacebookPagesService.create()` — vì UNIQUE `page_id` áp cả trên dòng đã xoá |
| `facebook_pages.connect_mode = FB_LOGIN` ⇒ `connection_id` **phải** khác null; `MANUAL_TOKEN` ⇒ luôn null | `FacebookConnectService.importPages()` / `FacebookPagesService.create()` |
| Import trúng page đang `MANUAL_TOKEN` ⇒ **không tự ghi đè token**, trả `needsConfirm` để user xác nhận | `FacebookConnectService.importPages()` — ghi đè token System User đang chạy tốt bằng token cá nhân là hạ độ bền |
| Chỉ import page mà tài khoản có task `CREATE_CONTENT` | `FacebookConnectService.importPages()` (400 kèm lý do) |
| `facebook_connections.user_token_enc` là **long-lived user token** (~60 ngày), khác hẳn `facebook_pages.access_token_enc` (Page token, không hết hạn) | `FacebookConnectService.handleCallback()` |
| Ngắt kết nối = `revoked_at = now()` + `user_token_enc = null`; **không** đụng token của page đang chạy | `FacebookConnectService.revoke()` |
| `app_settings['facebook_app'].value` = `{ appId, appSecretEnc }`; không có bản ghi ⇒ fallback `META_APP_ID`/`META_APP_SECRET` trong `.env` | `SettingsService.getFacebookAppSettings()` (ADR-014) |
| `app_settings.key` ∈ `google_drive` \| `facebook_app` \| `system` | Service (DTO enum) — DB để string cho dễ mở rộng |
| Secret trong `app_settings.value` luôn là ciphertext AES-256-GCM | `CryptoService`; API trả bản mask, không trả JSON gốc |
| Không có bản ghi `app_settings` ⇒ đọc fallback từ `.env` | `SettingsService.getDriveConfig()` (ADR-014) |
| `app_settings['google_drive'].value` có `authMode ∈ service_account \| oauth2` (plan 03c). Field mã hoá: `serviceAccountJsonEnc`, `oauthClientSecretEnc`, `oauthRefreshTokenEnc` | Không đổi cột DB (JSONB) — shape do `settings.types.ts` định nghĩa |
| Một `slot_runs` = một lần cron chạm slot đó trong ngày. **Không có dòng nào = cron chưa chạy**, khác hẳn `SKIPPED` (cron chạy nhưng hết bài) | `SlotRunService.claim()/finish()` — INSERT rồi UPDATE cùng một hàng |
| `slot_runs.status = SKIPPED` bắt buộc có `skip_reason`; `ERROR` bắt buộc có `error_message` | `SlotRunService.finish()` |
| `publish_job_events.raw_error` **không được chứa access token** (đi qua `sanitizeRawError`) | `PublishJobEventsService.log()` — có unit test riêng |
| `content_asset_files` chỉ chứa ảnh **phụ** (`position >= 1`). Ảnh đầu tiên của bài vẫn là `content_assets.drive_file_id` (vị trí 0) ⇒ record 1 ảnh không cần backfill. Danh sách ảnh đầy đủ của một bài = `[content_assets.drive_file_id, ...content_asset_files ORDER BY position]` | `PublishJobsRepository.findForExecution()` (nơi **duy nhất** được ghép; xem `plans/22-content-multi-image.md` §3.2) |
| Chỉ `media_type = image` mới có `content_asset_files`; tối đa `MAX_IMAGES_PER_CONTENT_ASSET` (10) ảnh/bài | `ContentAssetsService.create()` (400) — Graph API không ghép nhiều video vào một bài feed |
| Danh sách ảnh của một bài **cố định lúc upload** — sửa bài không đổi được ảnh, muốn đổi thì xoá record và upload lại | `ContentAssetsService.update()` không nhận `extraFiles` |
| Mỗi lần cron chạm slot lấy tối đa `post_count` bài, mỗi bài ⇒ đúng **1** job; bài nhiều ảnh tự thành 1 bài album lúc publish, picker không cần biết | `AutoPostSchedulerService.runSlot()` |
| Bài album thành công ⇒ record `content_assets` đổi `PUBLISHED` + assignment ghi `facebook_post_id` của **bài feed** (mọi ảnh nằm chung một bài viết, không phải mỗi ảnh một bài) | `PublishJobsRepository.markSuccess()` |
| `publish_job_events` là nhật ký kỹ thuật (retry, lỗi Graph); `audit_logs` là dấu vết nghiệp vụ (`AUTO_PUBLISH`, actor = Bot ⇒ `user_id = null`) | Hai đường ghi tách bạch, không nhồi stacktrace vào audit |

**Cascade:** `content_page_assignments` và `content_asset_files` xóa theo
`content_assets`; `auto_post_slots` xóa theo `facebook_pages`; `slot_runs` xóa theo
`auto_post_slots`; `publish_job_events` xóa theo `publish_jobs`. `publish_jobs`
**không** cascade (giữ lịch sử).

---

## 5. Lịch sử thay đổi

| Ngày | Migration | Nội dung |
|------|-----------|----------|
| 2026-08-06 | `20260806*_content_asset_files` | **Plan 22 (nhiều ảnh trong 1 content record) — migration ĐẢO NGƯỢC MỘT PHẦN `20260805170928_album_post`.** (1) **Xoá** `auto_post_slots.assets_per_post` và **xoá nguyên bảng** `publish_job_assets`. (2) Bảng mới `content_asset_files` (`content_asset_id`, `position >= 1`, `drive_file_id`, `drive_url`, `thumbnail_url`, `mime_type`, `file_size`), UNIQUE `(content_asset_id, position)`, cascade theo `content_assets`. **Lý do đảo ngược (quyết định user 2026-08-06):** hướng cũ để Bot tự ghép N record rời rạc thành 1 album — phức tạp (picker phải loại 2 đường), chỉ chạy được với auto-post, và không giúp gì cho đăng tay. Hướng mới gom nhiều ảnh ngay ở **1 record lúc upload** ⇒ picker quay lại đơn giản (1 job/1 content), đăng tay **tự động** có album mà không phải code thêm. Kiểm tra trước khi migrate: `publish_job_assets` = 0 dòng, mọi slot `assets_per_post = 1` ⇒ không mất dữ liệu. |
| 2026-08-06 | `20260805170928_album_post` | **Plan 21 (đăng nhiều ảnh trong 1 bài).** (1) Thêm `auto_post_slots.assets_per_post` (int, `DEFAULT 1` ⇒ mốc giờ cũ giữ nguyên hành vi 1 ảnh/bài). (2) Bảng mới `publish_job_assets` (`publish_job_id`, `content_asset_id`, `position`) giữ **ảnh phụ** của bài album, cascade theo `publish_jobs`. Lý do chỉ giữ ảnh phụ thay vì toàn bộ: `publish_jobs.content_asset_id` ở lại NOT NULL nên timeline/dashboard/monitor/đăng tay/retry không phải sửa và job cũ không cần backfill. Picker phải loại **cả hai** đường (job chính + ảnh phụ), nếu không Bot sẽ chọn lại chính ảnh phụ của album đang chờ đăng. |
| 2026-08-03 | `20260803154543_content_assets_is_active` | **Plan 19 (Multi action).** Thêm `content_assets.is_active` (boolean, `DEFAULT true` ⇒ bài cũ giữ nguyên hành vi) + index `is_active`; đổi index picker `(status, updated_at)` → **`(status, is_active, updated_at)`**. Lý do: cần "ngưng dùng" một bài mà không xoá và không đụng tới quy trình duyệt (`status` có bảng chuyển trạng thái riêng, `PUBLISHING`/`PUBLISHED` chỉ Bot set — nhét "ngưng dùng" vào đó sẽ đẻ thêm ~10 cặp chuyển trạng thái). |
| 2026-08-03 | `20260803130538_content_assets_editor` | **Plan 18.** Thêm cột `content_assets.editor_id` (uuid, **nullable**, FK → `users.id`, quan hệ `ContentEditor`) + index `editor_id`. Lý do: trang "Quản lý Ảnh/Video Edit" cần biết **ai dựng** video/ảnh — khác với `created_by` (ai upload lên hệ thống). Chỉ chọn được account role `EDITOR` đang active (kiểm ở service, DB không diễn tả được). Index vì trang list có filter theo Editor. |
| 2026-07-26 | `20260726163154_facebook_login_connection` | **Plan 15 (kết nối Page bằng đăng nhập Facebook).** (1) Bảng mới `facebook_connections`: giữ **long-lived user token** (~60 ngày, mã hoá) của tài khoản Facebook đã đăng nhập, kèm `fb_user_id` UNIQUE, `scopes`, `revoked_at`. Lý do giữ lại thay vì vứt sau khi lấy Page token: cần để đồng bộ page mới và lấy lại Page token mà không bắt user đăng nhập lại. (2) `facebook_pages` thêm `connect_mode` (enum `FacebookConnectMode`, default `MANUAL_TOKEN` — dòng cũ giữ nguyên nghĩa) + `connection_id` (FK nullable, index). Lý do: user chỉ được share quyền trên Page doanh nghiệp, không cầm System User ⇒ phải lấy Page token vĩnh viễn qua đăng nhập cá nhân, nhưng luồng dán token tay vẫn phải sống song song. |
| 2026-07-25 | `20260725122007_autopost_engine_logs` | **Plan 07 (engine auto-post).** (1) Mở rộng `slot_runs` thành nhật ký cron: thêm `status` (enum `SlotRunStatus`), `picked_count`, `job_created_count`, `skip_reason`, `started_at`, `finished_at`, `error_message` + index `(run_date, status)`. UNIQUE cũ giữ nguyên vì vẫn là khoá chống double-fire. Lý do: trả lời được "tới giờ mà không đăng gì — vì hết bài, page tắt, hay cron không chạy?". (2) Bảng mới `publish_job_events` + enum `PublishJobEventType`: nhật ký từng lần thử đăng (attempt, event, message, `raw_error` jsonb đã lọc token), cascade theo `publish_jobs`. |
| 2026-07-25 | `20260725062013_content_assets_updated_by` | Thêm cột `content_assets.updated_by` (uuid, nullable, FK → `users.id`) + quan hệ `ContentUpdater`. Lý do: trang "Quản lý Ảnh/Video Edit" cần tracking **ai sửa gần nhất** bên cạnh `created_by` (ai upload). Nullable vì dòng cũ không biết ai sửa; không index vì chưa có truy vấn lọc theo cột này. |
| 2026-07-25 | `20260725033247_facebook_pages_deleted_at` | Thêm cột `facebook_pages.deleted_at` + index. Lý do: `remove()` trước đây chỉ set `is_active=false` mà `findMany()` không lọc ⇒ page bị xoá vẫn hiện trên UI; mà không thể lọc theo `is_active` vì cột đó mang nghĩa "tạm dừng". Tách hẳn 2 khái niệm. |
| 2026-07-24 | (không migration) | Plan 03c: mở rộng **shape JSONB** `app_settings['google_drive']` thêm `authMode` + field OAuth2 (`oauthClientId/oauthClientSecretEnc/oauthRefreshTokenEnc/oauthAccountEmail`). Không đổi cột/bảng nên không tạo migration. |
| 2026-07-22 | `20260722153213_app_settings` | Thêm bảng `app_settings` (key/value JSONB) cho cấu hình động sửa từ UI "Cài đặt chung" — bắt đầu với nhóm `google_drive` (ADR-014). Thêm quan hệ `users ||--o{ app_settings`. |
| 2026-07-22 | `20260722145631_init` | Khởi tạo 8 bảng theo `docs/03-database-design.md` + bổ sung `slot_runs` chống cron double-fire (ADR-006). Đã verify khớp `\dt` trên Postgres. |
