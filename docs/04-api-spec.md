# 04 — API Specification

> REST API đầy đủ cho V1 — Base URL: `/api`

**Auth:** Bearer `Authorization: Bearer <access_token>`

**Content-Type:** `application/json`

**Pagination:** `?page=1&limit=20` → response meta `{ page, limit, total, totalPages }`

**Errors:**

```json
{
  "statusCode": 400,
  "message": ["email must be an email"],
  "error": "Bad Request",
  "correlationId": "uuid"
}
```

---

## 1. Auth

### POST `/auth/login`

**Public**

**Request:**

```json
{
  "email": "user@company.local",
  "password": "secret"
}
```

**Response 200:**

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "user@company.local",
    "role": "PUBLISHER"
  }
}
```

**Errors:** 401 invalid credentials, 403 inactive user

---

### POST `/auth/refresh`

**Public**

**Request:**

```json
{
  "refreshToken": "eyJ..."
}
```

**Response 200:** Same as login (new token pair)

---

### GET `/auth/me`

**Auth required**

**Response 200:**

```json
{
  "id": "uuid",
  "email": "user@company.local",
  "role": "ADMIN",
  "isActive": true
}
```

---

## 2. Users

**Roles:** ADMIN only (except `/auth/me`)

### GET `/users`

**Query:** `?page=1&limit=20&role=PUBLISHER&isActive=true&search=email`

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "pub@company.local",
      "role": "PUBLISHER",
      "isActive": true,
      "createdAt": "2026-07-01T00:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
}
```

---

### POST `/users`

**Request:**

```json
{
  "email": "new@company.local",
  "password": "TempPass123!",
  "role": "CONTENT"
}
```

**Response 201:** User object (no password)

---

### PUT `/users/:id`

**Request:**

```json
{
  "email": "updated@company.local",
  "role": "PUBLISHER",
  "isActive": true,
  "password": "optional-new-password"
}
```

**Response 200:** Updated user

---

### DELETE `/users/:id`

Soft delete: `isActive=false`

**Response 204**

---

## 3. Facebook Pages

**Roles:** GET all authenticated; CUD = ADMIN

### GET `/pages`

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid",
      "pageName": "Brand Page A",
      "pageId": "123456789",
      "tokenExpireAt": "2026-12-01T00:00:00.000Z",
      "isActive": true,
      "tokenMasked": "****abcd",
      "createdAt": "2026-07-01T00:00:00.000Z"
    }
  ]
}
```

---

### POST `/pages`

**Request:**

```json
{
  "pageName": "Brand Page A",
  "pageId": "123456789",
  "accessToken": "EAAx...",
  "tokenExpireAt": "2026-12-01T00:00:00.000Z"
}
```

**Response 201**

---

### PUT `/pages/:id`

**Request:** Partial update — `pageName`, `accessToken`, `tokenExpireAt`, `isActive`

**Response 200**

---

### DELETE `/pages/:id`

Soft delete `isActive=false` — **Response 204**

---

## 4. Content Assets

### GET `/content`

**Roles:** All authenticated

**Query:**

```
?page=1&limit=20
&search=flash
&category=Sale
&approved=true
&mediaType=image
&sortBy=updatedAt
&sortOrder=desc
```

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid",
      "sheetRowId": "CNT-001",
      "category": "Sale",
      "title": "Flash Sale",
      "caption": "Giảm giá 50%",
      "mediaType": "image",
      "driveUrl": "https://drive.google.com/...",
      "approved": true,
      "owner": "content-team",
      "sheetUpdatedAt": "2026-07-05T10:00:00.000Z",
      "updatedAt": "2026-07-05T10:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

---

### GET `/content/:id`

**Response 200:** Single content object

---

### PATCH `/content/:id/approve`

**Roles:** CONTENT, ADMIN

**Request:**

```json
{
  "approved": true
}
```

**Response 200**

---

### PUT `/content/:id`

**Roles:** CONTENT, ADMIN — manual edit (override sheet)

**Request:**

```json
{
  "title": "Updated title",
  "caption": "Updated caption",
  "category": "Sale",
  "driveUrl": "https://...",
  "mediaType": "video"
}
```

---

### POST `/content/sync`

**Roles:** CONTENT, ADMIN

Trigger Google Sheet sync.

**Response 200:**

```json
{
  "syncLogId": "uuid",
  "rowsCreated": 5,
  "rowsUpdated": 3,
  "rowsSkipped": 92,
  "rowsFailed": 0,
  "errors": [],
  "durationMs": 4500
}
```

---

### GET `/content/sync/logs`

**Roles:** CONTENT, ADMIN

**Query:** `?page=1&limit=10`

List recent sync history.

---

## 5. Publish Jobs

### GET `/publish-jobs`

**Query:**

```
?page=1&limit=20
&status=FAILED
&facebookPageId=uuid
&from=2026-07-01T00:00:00Z
&to=2026-07-31T23:59:59Z
&contentAssetId=uuid
```

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid",
      "contentAsset": {
        "id": "uuid",
        "title": "Flash Sale",
        "sheetRowId": "CNT-001"
      },
      "facebookPage": {
        "id": "uuid",
        "pageName": "Page A"
      },
      "scheduledAt": "2026-07-06T01:00:00.000Z",
      "status": "QUEUED",
      "publishedAt": null,
      "facebookPostId": null,
      "errorMessage": null,
      "attemptCount": 0,
      "createdBy": { "id": "uuid", "email": "pub@company.local" },
      "createdAt": "2026-07-05T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 50, "totalPages": 3 }
}
```

---

### GET `/publish-jobs/calendar`

**Query:** `?from=2026-07-01&to=2026-07-07`

Calendar-optimized payload grouped by date.

**Response 200:**

```json
{
  "2026-07-06": [
    {
      "id": "uuid",
      "scheduledAt": "2026-07-06T01:00:00.000Z",
      "status": "QUEUED",
      "title": "Flash Sale",
      "pageName": "Page A"
    }
  ]
}
```

---

### GET `/publish-jobs/:id`

**Response 200:** Full job detail

---

### POST `/publish-jobs`

**Roles:** PUBLISHER, ADMIN

**Request:**

```json
{
  "contentAssetId": "uuid",
  "facebookPageId": "uuid",
  "scheduledAt": "2026-07-06T01:00:00.000Z"
}
```

**Business rules:**
- Content must be `approved=true`
- Page must be `isActive=true`
- `scheduledAt` >= now - 1 minute (publish now allowed)

**Response 201:** Created job with status `QUEUED` (after enqueue)

---

### POST `/publish-jobs/bulk`

**Roles:** PUBLISHER, ADMIN

Schedule same content to multiple pages.

**Request:**

```json
{
  "contentAssetId": "uuid",
  "facebookPageIds": ["uuid1", "uuid2"],
  "scheduledAt": "2026-07-06T01:00:00.000Z"
}
```

**Response 201:** `{ "created": [...], "failed": [] }`

---

### PATCH `/publish-jobs/:id/cancel`

**Roles:** PUBLISHER, ADMIN

Cancel if status in `[APPROVED, QUEUED, FAILED]`

**Response 200:** `{ "id": "uuid", "status": "CANCELLED" }`

---

### PATCH `/publish-jobs/:id/reschedule`

**Roles:** PUBLISHER, ADMIN

**Request:**

```json
{
  "scheduledAt": "2026-07-06T02:00:00.000Z"
}
```

Only if status `QUEUED` or `APPROVED` — remove old Bull job, re-enqueue.

---

### POST `/publish-jobs/:id/retry`

**Roles:** PUBLISHER, ADMIN

**Response 200:**

```json
{
  "id": "uuid",
  "status": "QUEUED",
  "attemptCount": 0
}
```

---

## 6. Dashboard

### GET `/dashboard/stats`

**Query:** `?from=2026-07-01&to=2026-07-31`

**Response 200:**

```json
{
  "totalPosts": 150,
  "successPosts": 140,
  "failedPosts": 8,
  "cancelledPosts": 2,
  "queuedPosts": 5,
  "activePages": 12,
  "activeUsers": 8,
  "successRate": 93.33
}
```

---

### GET `/dashboard/chart/daily`

**Query:** `?days=7`

**Response 200:**

```json
{
  "labels": ["2026-06-29", "2026-06-30", "..."],
  "success": [20, 18, 22],
  "failed": [1, 0, 2]
}
```

---

## 7. Queue Monitor

### GET `/queue/jobs`

**Roles:** PUBLISHER, ADMIN

BullMQ job snapshot (active, waiting, delayed, failed).

**Response 200:**

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
      "scheduledAt": "2026-07-06T01:00:00.000Z",
      "delay": 3600000
    }
  ]
}
```

---

## 8. Audit Logs

### GET `/audit-logs`

**Roles:** ADMIN

**Query:** `?page=1&limit=50&action=USER_CREATE&userId=uuid&from=&to=`

**Response 200:**

```json
{
  "data": [
    {
      "id": "uuid",
      "user": { "email": "admin@company.local" },
      "action": "SCHEDULE_UPDATE",
      "resource": "publish_jobs:uuid",
      "oldValue": { "scheduledAt": "2026-07-06T01:00:00.000Z" },
      "newValue": { "scheduledAt": "2026-07-06T02:00:00.000Z" },
      "createdAt": "2026-07-05T15:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 50, "total": 200, "totalPages": 4 }
}
```

---

## 9. Health

### GET `/health`

**Public**

```json
{
  "status": "ok",
  "timestamp": "2026-07-05T10:00:00.000Z"
}
```

### GET `/health/ready`

```json
{
  "database": "up",
  "redis": "up"
}
```

---

## 10. Swagger Setup

```typescript
// main.ts
const config = new DocumentBuilder()
  .setTitle('Social Publishing API')
  .setVersion('1.0')
  .addBearerAuth()
  .build();
SwaggerModule.setup('api/docs', app, document);
```

---

## 11. HTTP Status Code Summary

| Code | Usage |
|------|-------|
| 200 | OK |
| 201 | Created |
| 204 | No content (delete) |
| 400 | Validation error |
| 401 | Not authenticated |
| 403 | Forbidden (RBAC) |
| 404 | Not found |
| 409 | Conflict (duplicate schedule, invalid state) |
| 422 | Business rule violation |
| 500 | Internal error |

---

## 12. Rate Limiting (Optional V1)

```typescript
ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }])
// Login: 5 req/min per IP
```

---

## 13. Implementation Checklist

- [ ] Global `ValidationPipe` (`whitelist: true, forbidNonWhitelisted: true`)
- [ ] `TransformInterceptor` wrap response `{ data, meta }`
- [ ] `CorrelationIdMiddleware`
- [ ] DTO cho mọi endpoint
- [ ] E2E tests: auth flow, create publish job, RBAC 403 cases
