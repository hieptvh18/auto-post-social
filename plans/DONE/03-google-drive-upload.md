# Plan 03 — Google Drive + Upload media (config động)

**Milestone:** M2
**Trạng thái:** ✅
**Phụ thuộc:** Plan 01, Plan 02
**Spec:** `docs/06-google-drive.md`, `docs/04-api-spec.md` §4

---

## 1. Mục tiêu

Upload ảnh/video từ Web lên đúng folder Google Drive, trả về `fileId` và metadata
để tạo content. Có sẵn khả năng stream file về cho worker publish.

**Thay đổi so với plan gốc (chốt với user 2026-07-22):** cấu hình Drive
(service account, folder ID, driver, max upload) **không hardcode trong `.env`**
mà lưu trong DB, sửa được qua màn hình **"Cài đặt chung"** trên UI. `.env` chỉ còn
vai trò **fallback lúc bootstrap** khi DB chưa có bản ghi.

## 2. Ngoài phạm vi

Không lưu file trên server (kể cả tạm). Không tạo folder theo tháng/page. Không
resize/transcode. Không sinh thumbnail thủ công — dùng `thumbnailLink` của Drive.
Chưa làm tab Facebook/Hệ thống trong Cài đặt chung (chỉ dựng khung tab).

## 3. Thiết kế

### 3.1 Bảng `app_settings` — key/value theo nhóm

Một dòng = một nhóm cấu hình, `value` là JSONB. Nhóm MVP: `google_drive`.
Cấu trúc key/value để thêm nhóm sau (facebook, system) không cần migration.

```jsonc
// key = 'google_drive'
{
  "driver": "real",            // real | fake
  "folderId": "1abc...",
  "serviceAccountJsonEnc": "iv:authTag:ciphertext",  // AES-256-GCM
  "maxUploadMb": 200
}
```

Secret (`serviceAccountJsonEnc`) mã hoá bằng `TOKEN_ENCRYPTION_KEY` — cùng cơ chế
token FB. API **luôn trả bản mask** (chỉ trả `client_email` + `hasServiceAccount`),
không bao giờ trả JSON gốc ra ngoài.

### 3.2 Thứ tự ưu tiên đọc config

```text
SettingsService.getDriveConfig()
  1. đọc app_settings['google_drive'] → có thì dùng
  2. không có → fallback AppConfigService.drive (từ .env)
```

Cache trong process + bump version khi ghi ⇒ đổi config **không cần restart**.
`DriveStorageFactory` gọi lại `getDriveConfig()` mỗi lần lấy client và dựng lại
client khi version đổi.

### 3.3 Interface storage

```typescript
// infra/drive/drive-storage.interface.ts
export interface DriveStorage {
  upload(file: UploadFileInput): Promise<DriveFile>;   // { fileId, name, mimeType, size, webViewLink, thumbnailLink }
  createReadStream(fileId: string): Promise<Readable>;
  delete(fileId: string): Promise<void>;
}
```

Hai driver (ADR-003), chọn theo `driver` trong config động:
- `GoogleDriveStorage` — googleapis, service account, upload vào `folderId`,
  `files.get({ alt: 'media' }, { responseType: 'stream' })` để đọc.
- `FakeDriveStorage` — ghi thư mục tạm local, trả fileId giả. Dùng khi dev/test.

### 3.4 Endpoint

| Method | Path | Quyền | Mô tả |
|--------|------|-------|-------|
| `GET` | `/settings/google-drive` | `settings:manage` | Đọc config (đã mask secret) |
| `PUT` | `/settings/google-drive` | `settings:manage` | Lưu config, mã hoá JSON |
| `POST` | `/settings/google-drive/test` | `settings:manage` | Test kết nối tới folder |
| `POST` | `/media/upload` | `content:create` | Multipart, memoryStorage |

`POST /media/upload`: validate mime (`image/jpeg|png|webp`, `video/mp4|quicktime`)
+ size (theo `maxUploadMb` **động**) → `DriveStorage.upload` →
trả `{ fileId, driveUrl, thumbnailUrl, mimeType, size, mediaType }`.

### 3.5 Frontend

Menu item mới **"Cài đặt chung"** (`/settings`, icon `SettingOutlined`), chỉ ADMIN.
Trang dựng bằng `Tabs`; MVP có tab **Google Drive**: form driver (Radio real/fake),
folder ID, upload/paste service account JSON, max upload MB, nút **Test kết nối**.
Secret hiển thị dạng "đã cấu hình (client_email)" + nút thay thế, không đổ giá trị cũ.

## 4. Task

### Backend — cấu hình động
- [x] Schema `app_settings` (key UK, value jsonb, updated_by FK) + migration
- [x] Cập nhật `erd.md` (bảng + index + ghi chú ràng buộc + lịch sử)
- [x] `CryptoService` AES-256-GCM (`iv:authTag:ciphertext` base64) + round-trip test
- [x] Permission mới `settings:manage` (chỉ ADMIN) — BE `permissions.ts` + FE `utils/permissions.ts`
- [x] `SettingsRepository` + `SettingsService` (get/update + fallback env + cache version)
- [x] `SettingsController` GET/PUT/POST test + DTO validate
- [x] Audit log `SETTINGS_UPDATE`

### Backend — Drive & media
- [x] Interface `DriveStorage` + type `DriveFile`
- [x] `GoogleDriveStorage` (googleapis, service account từ config động)
- [x] `FakeDriveStorage` (ghi thư mục tạm, đọc lại bằng `createReadStream`)
- [x] `DriveStorageFactory` — chọn driver theo config động, dựng lại khi version đổi
- [x] Map lỗi Drive (quota, 403, không tìm thấy folder) → domain error, log response gốc
- [x] `MediaController.upload` + `MediaService` (validate mime/size, suy ra `mediaType`)
- [x] Env: giữ `GOOGLE_*` làm fallback, ghi rõ trong `.env.example` là "chỉ bootstrap"

### Test
- [x] `CryptoService`: round-trip · ciphertext hỏng ⇒ ném lỗi · sai format ⇒ ném lỗi
- [x] `SettingsService`: có bản ghi DB · không có ⇒ fallback env · mask secret ·
      giữ secret cũ khi PUT không gửi JSON mới · bump version
- [x] `MediaService`: mime hợp lệ/không · quá size · suy `mediaType` đúng · lỗi Drive → domain error
- [x] `FakeDriveStorage`: upload → stream round-trip · delete · file không tồn tại
- [x] `GoogleDriveStorage`: mock googleapis — upload, stream, map lỗi 403/404/quota
- [x] `DriveStorageFactory`: chọn đúng driver · cache theo version
- [x] `npm run lint && npm run test:cov && npm run build` xanh

### Frontend
- [x] Menu item "Cài đặt chung" + route `/settings` (ADMIN)
- [x] `SettingsPage` với Tabs, tab Google Drive
- [x] Cập nhật `canAccessRoute` cho `/settings`

- [x] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [x] Đổi `driver` từ UI (fake ↔ real) có hiệu lực **không cần restart**
- [x] `driver=fake` → upload mp4 trả fileId, đọc stream lại đúng nội dung
- [x] Upload `.exe` ⇒ 400; upload quá `maxUploadMb` ⇒ 400
- [x] `GET /settings/google-drive` **không** lộ service account JSON
- [x] Non-ADMIN gọi `/settings` ⇒ 403
- [x] DB chưa có bản ghi ⇒ vẫn chạy bằng giá trị `.env`

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Service account chưa được share folder ⇒ 404 khi upload | Message lỗi nói rõ "share folder cho service account email X"; nút Test kết nối bắt lỗi sớm |
| Video lớn nạp hết vào RAM | Giới hạn `maxUploadMb`; publish thì stream, không buffer |
| Đổi `TOKEN_ENCRYPTION_KEY` ⇒ mất service account đã lưu | Ghi cảnh báo trong `.env.example`; lỗi giải mã ⇒ message rõ "nhập lại service account" |
| Config động sai ⇒ upload hỏng toàn hệ thống | Nút Test kết nối trước khi lưu; fallback env vẫn còn |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:** 2026-07-22
- **File chính:** `backend/src/modules/settings/`, `backend/src/infra/drive/`,
  `backend/src/modules/media/`, `backend/src/infra/crypto/crypto.service.ts`,
  `frontend/src/pages/SettingsPage.tsx`
- **Khác thiết kế ban đầu:** config Drive chuyển từ `.env` sang bảng `app_settings`
  (env còn là fallback) → ADR-014. Thêm màn hình "Cài đặt chung" ngoài plan gốc.
- **Test:** xem `contexts.md` §5
- **Còn nợ:** tab Facebook/Hệ thống trong Cài đặt chung chưa làm (chờ M4)
