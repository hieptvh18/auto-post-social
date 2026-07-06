# 06 — Google Drive Integration

> Upload media, metadata, stream publish — v2.0

---

## 1. Vai trò Google Drive

| Có | Không |
|----|-------|
| Lưu trữ media (ảnh, video) | Google Sheet |
| Upload qua Web Admin | Sync sheet |
| Stream khi publish | Lưu file trên server |

Database chỉ lưu metadata:

- `drive_file_id`
- `mime_type`
- `file_size`
- `thumbnail_url`
- `drive_url` (optional, display)

---

## 2. Authentication

Dùng **Google Service Account** với quyền:

- Upload vào folder được share
- Read/download files trong folder

```env
GOOGLE_SERVICE_ACCOUNT_JSON=/secrets/sa.json
GOOGLE_DRIVE_FOLDER_ID=1abc_folder_id
```

Service account email phải được share **Editor** trên Drive folder.

---

## 3. Upload Flow

```text
Frontend (multipart)
  → POST /api/media/upload
  → GoogleDriveService.upload(buffer, mimeType, filename)
      1. files.create với parents=[GOOGLE_DRIVE_FOLDER_ID]
      2. Set permissions (optional: domain read)
      3. Extract thumbnailLink (image) hoặc generate preview
  → Response { driveFileId, driveUrl, thumbnailUrl, mimeType, fileSize }
  → Frontend gắn vào form tạo content
  → POST /content lưu metadata vào DB
```

### API: `files.create`

```typescript
const res = await drive.files.create({
  requestBody: {
    name: filename,
    parents: [folderId],
  },
  media: { mimeType, body: Readable.from(buffer) },
  fields: 'id, mimeType, size, thumbnailLink, webViewLink',
});
```

---

## 4. Thumbnail Strategy

| Media | Strategy |
|-------|----------|
| Image | `thumbnailLink` từ Drive API |
| Video | Drive thumbnail hoặc placeholder; optional ffmpeg frame V2 |

Lưu `thumbnail_url` trong `content_assets` để UI preview nhanh.

---

## 5. Stream Publish (Worker)

**Không download file về disk server.**

```text
Worker
  → GoogleDriveService.createReadStream(fileId)
  → Pipe stream → FacebookPublisher.uploadVideo(stream)
  → Không buffer toàn bộ file (tránh OOM với video lớn)
```

### API: `files.get` + `alt=media`

```typescript
const stream = await drive.files.get(
  { fileId, alt: 'media' },
  { responseType: 'stream' },
);
return stream.data as Readable;
```

### Size limits

- Validate `file_size` khi upload (e.g. max 500MB video)
- Facebook video limit: check Meta docs theo version

---

## 6. Error Handling

| Error | Action |
|-------|--------|
| 404 file not found | FAILED publish + message |
| 403 permission | Check SA share folder |
| Quota exceeded | Alert admin, pause upload |
| Network timeout | BullMQ retry |

---

## 7. NestJS Module Structure

```text
google-drive/
├── google-drive.module.ts
├── google-drive.service.ts
├── google-drive.client.ts      # googleapis wrapper
└── dto/
    └── upload-response.dto.ts
```

---

## 8. Security

- Service account JSON **không commit** — chỉ env/volume
- Upload endpoint: validate mime type whitelist (`image/*`, `video/mp4`, ...)
- Max file size guard ở multer + service
- CONTENT role only upload

---

## 9. Implementation Checklist

- [ ] `GoogleDriveClient` với SA auth
- [ ] `POST /media/upload` multipart
- [ ] Lưu metadata vào content (không binary)
- [ ] `createReadStream` cho worker
- [ ] Unit test mock googleapis
- [ ] E2E: upload → create content → publish stream
