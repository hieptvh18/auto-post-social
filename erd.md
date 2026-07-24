# ERD — Tool Auto FB

> **Bản đồ dữ liệu chính thức.** Mọi thay đổi schema PHẢI cập nhật file này —
> xem [.claude/rules/05-database-erd.md](./.claude/rules/05-database-erd.md).

**Cập nhật:** 2026-07-22
**Migration tương ứng:** `20260722153213_app_settings` (đã apply)
**Nguồn sự thật:** `backend/prisma/schema.prisma`

---

## 1. Sơ đồ

```mermaid
erDiagram
    users ||--o{ content_assets : "creates (created_by)"
    users ||--o{ content_assets : "approves (approved_by)"
    users ||--o{ facebook_pages : creates
    users ||--o{ audit_logs : performs
    users ||--o{ app_settings : "last updated by"
    content_assets ||--o{ content_page_assignments : "assigned to"
    facebook_pages ||--o{ content_page_assignments : receives
    content_assets ||--o{ publish_jobs : has
    facebook_pages ||--o{ publish_jobs : targets
    facebook_pages ||--o{ auto_post_slots : schedules
    auto_post_slots ||--o{ slot_runs : "fired as"

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
        uuid created_by FK
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
        text reject_comment
        uuid created_by FK
        uuid approved_by FK
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

---

## 3. Index & Unique

| Bảng | Index | Lý do |
|------|-------|-------|
| `users` | UNIQUE `email` | Định danh đăng nhập |
| `facebook_pages` | UNIQUE `page_id` | Định danh phía Meta |
| `facebook_pages` | `is_active` | Lọc page đang dùng |
| `content_assets` | **`(status, updated_at)`** | **Cron picker: APPROVED order `updated_at ASC`** |
| `content_assets` | `status` · `category` · `media_type` · `created_by` · `is_ads` | Bộ lọc trang quản lý + dashboard |
| `content_page_assignments` | **UNIQUE `(content_asset_id, facebook_page_id)`** | **Mỗi bài chỉ đăng 1 lần trên 1 page** |
| `content_page_assignments` | `(facebook_page_id, published_at)` | Thống kê bài đã đăng theo page |
| `auto_post_slots` | `(facebook_page_id, enabled)` | Cron quét slot đến giờ |
| `slot_runs` | **UNIQUE `(slot_id, run_date, run_time)`** | **Chống cron double-fire (ADR-006)** |
| `publish_jobs` | `status` · `schedule_time` | Queue monitor + timeline |
| `publish_jobs` | `(content_asset_id, facebook_page_id)` | Kiểm tra job trùng trong picker |
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
| Xóa page = soft delete (`is_active=false`) | Service — vì `publish_jobs` còn tham chiếu |
| `app_settings.key` ∈ `google_drive` \| `facebook` \| `system` | Service (DTO enum) — DB để string cho dễ mở rộng |
| Secret trong `app_settings.value` luôn là ciphertext AES-256-GCM | `CryptoService`; API trả bản mask, không trả JSON gốc |
| Không có bản ghi `app_settings` ⇒ đọc fallback từ `.env` | `SettingsService.getDriveConfig()` (ADR-014) |
| `app_settings['google_drive'].value` có `authMode ∈ service_account \| oauth2` (plan 03c). Field mã hoá: `serviceAccountJsonEnc`, `oauthClientSecretEnc`, `oauthRefreshTokenEnc` | Không đổi cột DB (JSONB) — shape do `settings.types.ts` định nghĩa |

**Cascade:** `content_page_assignments` xóa theo `content_assets`;
`auto_post_slots` xóa theo `facebook_pages`. `publish_jobs` **không** cascade (giữ lịch sử).

---

## 5. Lịch sử thay đổi

| Ngày | Migration | Nội dung |
|------|-----------|----------|
| 2026-07-24 | (không migration) | Plan 03c: mở rộng **shape JSONB** `app_settings['google_drive']` thêm `authMode` + field OAuth2 (`oauthClientId/oauthClientSecretEnc/oauthRefreshTokenEnc/oauthAccountEmail`). Không đổi cột/bảng nên không tạo migration. |
| 2026-07-22 | `20260722153213_app_settings` | Thêm bảng `app_settings` (key/value JSONB) cho cấu hình động sửa từ UI "Cài đặt chung" — bắt đầu với nhóm `google_drive` (ADR-014). Thêm quan hệ `users ||--o{ app_settings`. |
| 2026-07-22 | `20260722145631_init` | Khởi tạo 8 bảng theo `docs/03-database-design.md` + bổ sung `slot_runs` chống cron double-fire (ADR-006). Đã verify khớp `\dt` trên Postgres. |
