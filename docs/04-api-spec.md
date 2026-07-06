# 04 — API Specification

> REST API đầy đủ cho V1 (v2.0) — Base URL: `/api`

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
  "user": { "id": "uuid", "name": "User", "email": "...", "role": "PUBLISHER" }
}
```

### POST `/auth/refresh` — Public

### GET `/auth/me` — Auth required

---

## 2. Users (ADMIN)

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/users` | List (`?role=REVIEWER&search=`) |
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
  "pageName": "Brand Page A",
  "pageId": "123456789",
  "accessToken": "EAAx...",
  "tokenExpireAt": "2026-12-01T00:00:00.000Z"
}
```

Response list: `tokenMasked: "****abcd"` — không trả full token.

---

## 4. Media Upload (Google Drive)

### POST `/media/upload`

**Roles:** CONTENT, ADMIN

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

## 5. Content Assets

| Method | Path | Roles | Mô tả |
|--------|------|-------|-------|
| GET | `/content` | All | List + filter |
| GET | `/content/:id` | All | Detail + comments |
| POST | `/content` | CONTENT, ADMIN | Tạo mới |
| PUT | `/content/:id` | CONTENT, ADMIN | Sửa (DRAFT/REJECTED only) |
| DELETE | `/content/:id` | CONTENT, ADMIN | Xóa (DRAFT only) |
| PATCH | `/content/:id/submit` | CONTENT, ADMIN | → WAITING_APPROVAL |
| POST | `/content/:id/approve` | REVIEWER, ADMIN | → APPROVED |
| POST | `/content/:id/reject` | REVIEWER, ADMIN | → REJECTED |

### GET `/content` query

```
?page=1&limit=20&search=flash&category=Sale&status=APPROVED&mediaType=video
```

### POST `/content`

```json
{
  "title": "Flash Sale",
  "description": "Mô tả ngắn",
  "category": "Sale",
  "mediaType": "video",
  "driveFileId": "1abc...",
  "driveUrl": "https://...",
  "thumbnailUrl": "https://..."
}
```

Response: `status: "DRAFT"`

### POST `/content/:id/reject`

```json
{
  "comment": "Caption chưa đúng brand voice"
}
```

`comment` bắt buộc — tạo record trong `comments`.

### GET `/content/:id/comments`

List comments theo content.

---

## 6. Publish Jobs

| Method | Path | Roles |
|--------|------|-------|
| GET | `/publish-jobs` | PUBLISHER, ADMIN |
| GET | `/publish-jobs/calendar` | PUBLISHER, ADMIN |
| GET | `/publish-jobs/:id` | PUBLISHER, ADMIN |
| POST | `/publish-jobs` | PUBLISHER, ADMIN |
| POST | `/publish-jobs/bulk` | PUBLISHER, ADMIN |
| PATCH | `/publish-jobs/:id/cancel` | PUBLISHER, ADMIN |
| PATCH | `/publish-jobs/:id/reschedule` | PUBLISHER, ADMIN |
| POST | `/publish-jobs/:id/retry` | PUBLISHER, ADMIN |

### POST `/publish-jobs`

```json
{
  "contentAssetId": "uuid",
  "facebookPageId": "uuid",
  "caption": "Giảm giá 50% hôm nay!",
  "hashtags": "#sale #flash",
  "scheduleTime": "2026-07-06T01:00:00.000Z"
}
```

**Business rules:**
- Content `status = APPROVED`
- Page `isActive = true`
- `scheduleTime >= now - 1 minute` (publish now allowed)

**Response 201:** `status: "QUEUED"` (sau enqueue)

### GET `/publish-jobs/calendar`

```
?from=2026-07-01&to=2026-07-07
```

```json
{
  "2026-07-06": [
    {
      "id": "uuid",
      "scheduleTime": "2026-07-06T01:00:00.000Z",
      "status": "QUEUED",
      "title": "Flash Sale",
      "pageName": "Page A"
    }
  ]
}
```

---

## 7. Dashboard

### GET `/dashboard/stats`

```
?from=2026-07-01&to=2026-07-31
```

```json
{
  "waitingReview": 5,
  "approved": 12,
  "scheduled": 8,
  "publishing": 1,
  "successPosts": 140,
  "failedPosts": 3,
  "postsToday": 15,
  "postsThisMonth": 320,
  "activePages": 12,
  "activeUsers": 8
}
```

### GET `/dashboard/top-creators?days=30`

### GET `/dashboard/top-publishers?days=30`

### GET `/dashboard/chart/daily?days=7`

---

## 8. Queue Monitor

### GET `/queue/jobs`

**Roles:** PUBLISHER, ADMIN

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
      "scheduleTime": "2026-07-06T01:00:00.000Z"
    }
  ]
}
```

### GET `/queue/dead-letter`

Jobs chuyển sang DLQ sau max retries.

---

## 9. Audit Logs (ADMIN)

### GET `/audit-logs`

```
?page=1&limit=50&action=CONTENT_APPROVE&userId=uuid&from=&to=
```

```json
{
  "data": [
    {
      "id": "uuid",
      "user": { "email": "reviewer@company.local" },
      "action": "CONTENT_APPROVE",
      "resource": "content_assets:uuid",
      "beforeValue": { "status": "WAITING_APPROVAL" },
      "afterValue": { "status": "APPROVED" },
      "createdAt": "2026-07-05T15:00:00.000Z"
    }
  ]
}
```

---

## 10. Health

| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/health` | Public liveness |
| GET | `/health/ready` | DB + Redis check |

---

## 11. Error Format

```json
{
  "statusCode": 422,
  "message": "Cannot edit content in status APPROVED",
  "error": "Unprocessable Entity",
  "correlationId": "uuid"
}
```

---

## 12. HTTP Status Summary

| Code | Usage |
|------|-------|
| 200 | OK |
| 201 | Created |
| 204 | No content |
| 400 | Validation |
| 401 | Unauthorized |
| 403 | Forbidden (RBAC) |
| 404 | Not found |
| 409 | Conflict |
| 422 | Invalid status transition |
| 500 | Internal |

---

## 13. Implementation Checklist

- [ ] Global `ValidationPipe` (`whitelist: true`)
- [ ] `CorrelationIdMiddleware`
- [ ] DTO + Swagger cho mọi endpoint
- [ ] Permission guard thay vì hardcode role
- [ ] E2E: content workflow, publish, RBAC 403
