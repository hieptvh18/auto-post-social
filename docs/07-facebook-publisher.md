# 07 — Facebook Publisher

> Meta Graph API — publish image/video từ stream — v3.0

---

## 1. Overview

Worker publish content lên Facebook Page qua **Meta Graph API**.

```text
Load publish_job + content + page
  → Decrypt access_token
  → Stream media từ Google Drive
  → POST Graph API (photos / videos)
  → Update status + facebook_post_id
  → Audit log
```

**Không lưu media trên server** — chỉ pipe stream Drive → Facebook.

---

## 2. Required Permissions

Facebook App cần review:

| Permission | Mục đích |
|------------|----------|
| `pages_manage_posts` | Đăng bài |
| `pages_show_list` | List pages |
| `pages_read_engagement` | Read post metadata (optional) |

Page access token: long-lived token từ System User hoặc Page token flow.

---

## 3. Config

```env
META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v21.0
```

Base URL: `https://graph.facebook.com/{version}/{page-id}`

---

## 4. Publish Image

### Flow

```text
POST /{page-id}/photos
  source: stream (multipart)
  message: caption + hashtags
  published: true
```

```typescript
async publishImage(pageId: string, token: string, stream: Readable, message: string) {
  const form = new FormData();
  form.append('source', stream);
  form.append('message', message);
  form.append('published', 'true');
  form.append('access_token', token);

  const res = await axios.post(
    `${baseUrl}/${pageId}/photos`,
    form,
    { headers: form.getHeaders(), timeout: 60_000 },
  );
  return res.data.id; // photo/post id
}
```

---

## 5. Publish Video

### Resumable upload (video lớn)

```text
1. POST /{page-id}/videos — start upload session
2. Upload chunks (hoặc single stream nếu nhỏ)
3. Finish → video_id
```

V1 đơn giản: single stream upload nếu video < threshold (~100MB).

```typescript
async publishVideo(pageId: string, token: string, stream: Readable, message: string) {
  const form = new FormData();
  form.append('source', stream);
  form.append('description', message);
  form.append('access_token', token);

  const res = await axios.post(
    `${baseUrl}/${pageId}/videos`,
    form,
    { headers: form.getHeaders(), timeout: 120_000 },
  );
  return res.data.id;
}
```

---

## 6. Caption & Hashtag

Publisher setup trên `publish_jobs`:

```text
message = caption + "\n\n" + hashtags
```

Validate tổng length ≤ 63206 chars trước khi queue.

Thumbnail override: optional `thumb` param cho video (V1.1).

---

## 7. Error Classification

| Error type | Retry? | Example |
|------------|--------|---------|
| Network / 5xx | Yes (BullMQ) | ETIMEDOUT |
| Rate limit 429 | Yes with backoff | (#4) Application request limit |
| Invalid token 190 | No | Token expired → FAILED + alert |
| Permission 200 | No | Missing `pages_manage_posts` |
| Invalid media | No | Unsupported format |

```typescript
function isRetryable(error: FacebookApiError): boolean {
  if (error.status >= 500) return true;
  if (error.code === 4 || error.code === 17) return true; // rate limit
  if (error.code === 190) return false; // token
  return false;
}
```

---

## 8. Idempotency

Trước khi gọi FB API:

```typescript
if (job.status === 'SUCCESS' || job.status === 'CANCELLED') return;
const updated = await repo.updateStatusIfCurrent(job.id, 'QUEUED', 'PUBLISHING');
if (updated.count !== 1) return; // another worker picked up
```

Sau SUCCESS: lưu `facebook_post_id` — không publish lại.

---

## 9. Module Structure

```text
worker/src/
├── publishers/
│   ├── facebook-graph.client.ts
│   ├── facebook-publisher.service.ts
│   └── facebook-error.mapper.ts
└── processors/
    └── publish-facebook.processor.ts
```

---

## 10. Audit

Worker ghi audit sau publish:

```json
{
  "action": "PUBLISH_SUCCESS",
  "resource": "publish_jobs:uuid",
  "afterValue": {
    "facebookPostId": "123_456",
    "publishedAt": "2026-07-06T01:00:05.000Z"
  }
}
```

`userId` = `publish_job.created_by` hoặc system user.

---

## 11. Implementation Checklist

- [ ] `FacebookGraphClient` với timeout + error mapping
- [ ] Image publish via stream
- [ ] Video publish via stream
- [ ] Token decrypt từ encrypted storage
- [ ] Idempotent status transitions
- [ ] Integration test với staging Page (manual)
