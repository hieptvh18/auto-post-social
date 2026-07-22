# Plan 03 — Google Drive + Upload media

**Milestone:** M2
**Trạng thái:** ⬜
**Phụ thuộc:** Plan 01
**Spec:** `docs/06-google-drive.md`, `docs/04-api-spec.md` §4

---

## 1. Mục tiêu

Upload ảnh/video từ Web lên đúng folder Google Drive đã cấu hình, trả về `fileId`
và metadata để tạo content. Có sẵn khả năng stream file về cho worker publish.

## 2. Ngoài phạm vi

Không lưu file trên server (kể cả tạm). Không tạo folder theo tháng/page. Không
resize/transcode. Không sinh thumbnail thủ công — dùng `thumbnailLink` của Drive.

## 3. Thiết kế

```typescript
// infra/drive/drive-storage.interface.ts
export interface DriveStorage {
  upload(file: UploadFileInput): Promise<DriveFile>;   // { fileId, name, mimeType, size, webViewLink, thumbnailLink }
  createReadStream(fileId: string): Promise<Readable>;
  delete(fileId: string): Promise<void>;
}
```

Hai driver, chọn bằng `DRIVE_DRIVER` (ADR-003):
- `GoogleDriveStorage` — googleapis, service account, upload vào `GOOGLE_DRIVE_FOLDER_ID`,
  `files.get({ alt: 'media' }, { responseType: 'stream' })` để đọc.
- `FakeDriveStorage` — ghi vào thư mục tạm local, trả fileId giả. Dùng khi dev/test.

`POST /media/upload` (multipart, `FileInterceptor` + memoryStorage) →
validate mime (`image/jpeg|png|webp`, `video/mp4|quicktime`) + size (`MAX_UPLOAD_MB`)
→ `DriveStorage.upload` → trả `{ fileId, driveUrl, thumbnailUrl, mimeType, size, mediaType }`.

## 4. Task

- [ ] Interface `DriveStorage` + type `DriveFile`
- [ ] `GoogleDriveStorage` (googleapis, service account từ env: path hoặc base64)
- [ ] `FakeDriveStorage` (ghi `.tmp-drive/`, đọc lại bằng `createReadStream`)
- [ ] `GoogleDriveModule` — provider factory chọn driver theo `DRIVE_DRIVER`
- [ ] `MediaController.upload` + `MediaService` (validate mime/size, suy ra `mediaType`)
- [ ] Map lỗi Drive (quota, 403, không tìm thấy folder) → domain error, log response gốc
- [ ] Thêm env: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_DRIVE_FOLDER_ID`,
      `DRIVE_DRIVER`, `MAX_UPLOAD_MB` → cả `.env` và `.env.example`
- [ ] Unit test 100%: MediaService (mime hợp lệ/không, quá size, suy mediaType đúng,
      lỗi Drive → domain error), FakeDriveStorage (upload→stream round-trip),
      factory chọn đúng driver theo env
- [ ] `npm run lint && npm run test:cov && npm run build` xanh
- [ ] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [ ] `DRIVE_DRIVER=fake` → upload mp4 trả fileId, đọc stream lại đúng nội dung
- [ ] `DRIVE_DRIVER=real` + service account → file xuất hiện trong folder Drive cấu hình
- [ ] Upload `.exe` ⇒ 400; upload quá `MAX_UPLOAD_MB` ⇒ 400
- [ ] Không có file nào rơi lại trong thư mục project khi dùng driver real

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Service account chưa được share folder ⇒ 404 khi upload | Message lỗi nói rõ "share folder cho service account email X" |
| Video lớn nạp hết vào RAM | Giới hạn `MAX_UPLOAD_MB`; publish thì stream, không buffer |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:**
- **Còn nợ:**
