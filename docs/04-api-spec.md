# 04 — API Specification

> REST API đầy đủ cho V1 (v3.0 — mô hình Auto-Post) — Base URL: `/api`

**Auth:** `Authorization: Bearer <access_token>`

**Content-Type:** `application/json` (trừ upload: `multipart/form-data`)

**Pagination:** `?page=1&limit=20` → `{ data, meta: { page, limit, total, totalPages } }`

---

## 1. Auth

### POST `/auth/login` — Public

```json
// Request
{ "email": "user@company.local", "password": "secret" }

// Response 200
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900,
  "user": { "id": "uuid", "name": "User", "email": "...", "role": "EDITOR" }
}
```

### POST `/auth/refresh` — Public

### GET `/auth/me` — Auth required

---

## 2. Users (ADMIN)

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/users` | List (`?role=EDITOR&search=`) |
| POST | `/users` | Create |
| PUT | `/users/:id` | Update |
| DELETE | `/users/:id` | Soft delete (`isActive=false`) |

**POST `/users` request:**

```json
{
  "name": "Nguyen Van A",
  "email": "content@company.local",
  "password": "TempPass123!",
  "role": "CONTENT"
}
```

`role`: `ADMIN | EDITOR | CONTENT`

---

## 3. Facebook Pages

| Method | Path | Roles |
|--------|------|-------|
| GET | `/pages` | All authenticated |
| POST | `/pages` | ADMIN |
| PUT | `/pages/:id` | ADMIN |
| DELETE | `/pages/:id` | ADMIN |

**POST `/pages`:**

```json
{
  "pageName": "Luca — Hà Nội",
  "pageId": "123456789",
  "accessToken": "EAAx...",
  "tokenExpireAt": "2026-12-01T00:00:00.000Z"
}
```

Response list: `tokenMasked: "****abcd"` — không trả full token.

---

## 4. Media Upload (Google Drive)

### POST `/media/upload`

**Roles:** CONTENT, EDITOR, ADMIN

**Content-Type:** `multipart/form-data`

| Field | Type | Required |
|-------|------|----------|
| file | binary | Yes |
| category | string | No |

**Response 201:**

```json
{
  "driveFileId": "1abc...",
  "driveUrl": "https://drive.google.com/file/d/...",
  "thumbnailUrl": "https://...",
  "mimeType": "video/mp4",
  "fileSize": 15728640
}
```

Chi tiết: [06-google-drive.md](./06-google-drive.md)

---

## 5. Content Assets (trang Quản lý Ảnh/Video Edit)

| Method | Path | Roles | Mô tả |
|--------|------|-------|-------|
| GET | `/content-assets` | All | List + filter |
| GET | `/content-assets/:id` | All | Detail (kèm assignments/published) |
| POST | `/content-assets` | CONTENT, EDITOR, ADMIN | Tạo mới → PENDING_REVIEW |
| PATCH | `/content-assets/:id` | CONTENT (bài mình), EDITOR, ADMIN | Sửa full-field (kể cả duyệt) |
| DELETE | `/content-assets/:id` | CONTENT (bài mình), EDITOR, ADMIN | Xóa |

Không còn endpoint `submit` / `approve` / `reject` riêng — mọi thay đổi đi qua
**PATCH** duy nhất, service kiểm tra quyền theo field:

- `status`, `isAds` → yêu cầu permission `content:review` (EDITOR/ADMIN)
- `status: REJECTED` → `rejectComment` bắt buộc (400 nếu thiếu)
- CONTENT sửa bài REJECTED → status tự quay về PENDING_REVIEW
- `PUBLISHING`/`PUBLISHED` → chỉ worker set (422 nếu client gửi)

### GET `/content-assets` query

```
?page=1&limit=20&search=khớp&category=Thăm khám&status=APPROVED&mediaType=video
&createdBy=uuid&updatedFrom=2026-07-01&updatedTo=2026-07-31
```

### POST `/content-assets`

```json
{
  "title": "5 dấu hiệu thoái hóa khớp gối",
  "description": "Mô tả ngắn",
  "category": "Giáo dục sức khỏe",
  "caption": "⚠️ 5 dấu hiệu thoái hóa khớp gối bạn không nên bỏ qua!",
  "hashtags": "#thoáihoákhớp",
  "mediaType": "image",
  "driveFileId": "1abc...",
  "driveUrl": "https://...",
  "thumbnailUrl": "https://...",
  "assignedPageIds": ["uuid-page-1", "uuid-page-2"]
}
```

Response: `status: "PENDING_REVIEW"`. `caption` bắt buộc (bot dùng khi đăng).
`assignedPageIds` tạo records trong `content_page_assignments`.

### PATCH `/content-assets/:id` (ví dụ EDITOR duyệt)

```json
{ "status": "APPROVED", "isAds": true }
```

### Response detail

```json
{
  "id": "uuid",
  "title": "...",
  "status": "PUBLISHED",
  "isAds": true,
  "assignments": [
    { "pageId": "uuid-1", "pageName": "Luca — Hà Nội", "publishedAt": "2026-07-14T08:01:23Z", "facebookPostId": "fb_post_8821" },
    { "pageId": "uuid-2", "pageName": "Luca — TP.HCM", "publishedAt": null, "facebookPostId": null }
  ]
}
```

UI hiển thị badge `1/2 page` từ `assignments`.

---

## 6. Auto-Post Configs (ADMIN, EDITOR)

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/auto-post-configs` | Config tất cả pages (kèm slots) |
| PATCH | `/auto-post-configs/:pageId` | Bật/tắt auto-post cho page |
| POST | `/auto-post-configs/:pageId/slots` | Thêm mốc giờ |
| PATCH | `/auto-post-slots/:slotId` | Sửa mốc giờ / bật tắt |
| DELETE | `/auto-post-slots/:slotId` | Xóa mốc giờ |

### POST `/auto-post-configs/:pageId/slots`

```json
{
  "time": "08:00",
  "categories": ["Cơ xương khớp", "Thăm khám"],
  "mediaType": "video",
  "postCount": 1
}
```

### GET `/auto-post-configs` response

```json
[
  {
    "pageId": "uuid",
    "pageName": "Luca — Hà Nội",
    "enabled": true,
    "slots": [
      { "id": "uuid", "time": "08:00", "categories": ["Cơ xương khớp", "Thăm khám"], "mediaType": "video", "postCount": 1, "enabled": true }
    ]
  }
]
```

---

## 7. Publish Jobs (do Bot tạo — client chỉ đọc/retry)

| Method | Path | Roles |
|--------|------|-------|
| GET | `/publish-jobs` | EDITOR, ADMIN |
| GET | `/publish-jobs/timeline?date=2026-07-16&pageId=&status=` | EDITOR, ADMIN |
| GET | `/publish-jobs/:id` | EDITOR, ADMIN |
| PATCH | `/publish-jobs/:id/cancel` | ADMIN |
| POST | `/publish-jobs/:id/retry` | ADMIN |

### GET `/publish-jobs/timeline`

```json
{
  "2026-07-16": [
    {
      "id": "uuid",
      "scheduleTime": "2026-07-16T08:00:00.000Z",
      "status": "SUCCESS",
      "title": "BS. Bảo giải đáp: Đau cổ vai gáy",
      "pageName": "Luca — Hà Nội",
      "category": "Thăm khám",
      "mediaType": "video",
      "facebookPostId": "fb_post_8830",
      "driveUrl": "https://drive.google.com/...",
      "createdBy": "Bot"
    }
  ]
}
```

---

## 8. Dashboard

### GET `/dashboard/stats`

```
?from=2026-07-01&to=2026-07-31
```

```json
{
  "pendingReview": 5,
  "approved": 12,
  "publishing": 1,
  "successPosts": 140,
  "failedPosts": 3,
  "adsVideos": 8,
  "activePages": 3,
  "activeUsers": 4
}
```

### GET `/dashboard/posts-by-page?from=&to=&mediaType=video|image|all`

```json
[
  { "pageId": "uuid", "pageName": "Luca — Hà Nội", "imagePosts": 12, "videoPosts": 20 }
]
```

### GET `/dashboard/chart/daily?from=&to=`

---

## 9. Queue Monitor (ADMIN)

### GET `/queue/jobs`

```json
{
  "waiting": 3,
  "active": 1,
  "delayed": 10,
  "failed": 2,
  "jobs": [
    {
      "bullJobId": "123",
      "publishJobId": "uuid",
      "status": "delayed",
      "attemptsMade": 0,
      "scheduleTime": "2026-07-16T01:00:00.000Z"
    }
  ]
}
```

### GET `/queue/dead-letter`

Jobs chuyển sang DLQ sau max retries.

---

## 10. Audit Logs (ADMIN)

### GET `/audit-logs`

```
?page=1&limit=50&action=CONTENT_STATUS_CHANGE&userId=uuid&from=&to=
```

```json
{
  "data": [
    {
      "id": "uuid",
      "user": { "email": "editor@company.local" },
      "action": "CONTENT_STATUS_CHANGE",
      "resource": "content_assets:uuid",
      "beforeValue": { "status": "PENDING_REVIEW" },
      "afterValue": { "status": "APPROVED" },
      "createdAt": "2026-07-15T15:00:00.000Z"
    }
  ]
}
```

---

## 11. Health

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/health` | Public liveness |
| GET | `/health/ready` | DB + Redis check |

---

## 12. Error Format

```json
{
  "statusCode": 422,
  "message": "Status PUBLISHING can only be set by the publish worker",
  "error": "Unprocessable Entity",
  "correlationId": "uuid"
}
```

---

## 13. HTTP Status Summary

| Code | Usage |
|------|-------|
| 200 | OK |
| 201 | Created |
| 204 | No content |
| 400 | Validation (VD: REJECTED thiếu rejectComment) |
| 401 | Unauthorized |
| 403 | Forbidden (RBAC — VD: CONTENT đổi status) |
| 404 | Not found |
| 409 | Conflict (VD: assignment trùng content × page) |
| 422 | Invalid status transition |
| 500 | Internal |

---

## 14. Implementation Checklist

- [ ] Global `ValidationPipe` (`whitelist: true`)
- [ ] `CorrelationIdMiddleware`
- [ ] DTO + Swagger cho mọi endpoint
- [ ] Permission guard theo field (PATCH content-assets)
- [ ] E2E: duyệt qua PATCH, cron picker, RBAC 403, unique content×page 409
