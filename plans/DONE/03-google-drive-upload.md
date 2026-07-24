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
  "authMode": "service_account",   // service_account | oauth2
  "folderId": "1abc...",
  "serviceAccountJsonEnc": "iv:authTag:ciphertext",   // AES-256-GCM, mode=service_account
  "oauthClientIdEnc": "iv:authTag:ciphertext",        // mode=oauth2
  "oauthClientSecretEnc": "iv:authTag:ciphertext",    // mode=oauth2
  "oauthRefreshTokenEnc": "iv:authTag:ciphertext",    // mode=oauth2, lấy qua flow "Kết nối Google"
  "oauthAccountEmail": "user@gmail.com",              // mode=oauth2, chỉ để hiển thị
  "maxUploadMb": 200
}
```

**Cập nhật 2026-07-24 (ADR-016, ADR-017):** không còn driver `fake` — Drive luôn gọi
API thật. Có **2 chế độ xác thực** chọn ở UI, không phải driver ảo/thật:
- `service_account`: SA JSON, chỉ ghi được **Shared Drive** (Google Workspace, có quota).
- `oauth2`: tài khoản Google cá nhân (Gmail free), lấy refresh token qua **OAuth flow
  trong app** (`GET /settings/google-drive/oauth/url` + callback public bảo vệ bằng
  `state` single-use). Xem chi tiết thiết kế ở
  [plans/03c-drive-auth-modes.md](../03c-drive-auth-modes.md).

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

Một implementation duy nhất — `GoogleDriveStorage` (googleapis) — dựng client theo
`authMode` (`service_account` hoặc `oauth2`, ADR-016), upload vào `folderId`,
`files.get({ alt: 'media' }, { responseType: 'stream' })` để đọc. Không còn driver
`fake` (ADR-017, thay ADR-003) — unit test mock trực tiếp `googleapis`, không có
class fake riêng.

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
Trang dựng bằng `Tabs`; MVP có tab **Google Drive**: chọn `authMode` (`service_account`
| `oauth2`), folder ID, upload/paste service account JSON (mode SA) hoặc OAuth Client
ID/Secret + nút "Kết nối Google" (mode OAuth2), max upload MB, nút **Test kết nối**.
Secret hiển thị dạng "đã cấu hình (client_email)" / "đã kết nối (email)" + nút thay
thế, không đổ giá trị cũ.

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
- [x] `GoogleDriveStorage` (googleapis, dựng client theo `authMode` từ config động)
- [x] `DriveStorageFactory` — dựng client theo config động, dựng lại khi version đổi
- [x] Map lỗi Drive (quota, 403, không tìm thấy folder) → domain error, log response gốc
- [x] `MediaController.upload` + `MediaService` (validate mime/size, suy ra `mediaType`)
- [x] Env: giữ `GOOGLE_*` làm fallback, ghi rõ trong `.env.example` là "chỉ bootstrap"
- [x] **(bổ sung 2026-07-24)** OAuth2 flow: `DriveOAuthService` + `DriveOAuthController`
      (`GET .../oauth/url`, `GET .../oauth/callback` @Public + `state` single-use TTL 10')
- [x] **(bổ sung 2026-07-24)** Bỏ hẳn driver `fake` khỏi hệ thống (ADR-017)

### Test
- [x] `CryptoService`: round-trip · ciphertext hỏng ⇒ ném lỗi · sai format ⇒ ném lỗi
- [x] `SettingsService`: có bản ghi DB · không có ⇒ fallback env · mask secret ·
      giữ secret cũ khi PUT không gửi JSON mới · bump version
- [x] `MediaService`: mime hợp lệ/không · quá size · suy `mediaType` đúng · lỗi Drive → domain error
- [x] `GoogleDriveStorage`: mock googleapis — upload, stream, map lỗi 403/404/quota, 2 authMode
- [x] `DriveStorageFactory`: dựng đúng client theo `authMode` · cache theo version
- [x] `npm run lint && npm run test:cov && npm run build` xanh

### Frontend
- [x] Menu item "Cài đặt chung" + route `/settings` (ADMIN)
- [x] `SettingsPage` với Tabs, tab Google Drive
- [x] Cập nhật `canAccessRoute` cho `/settings`

- [x] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [x] Đổi `authMode` từ UI (service_account ↔ oauth2) có hiệu lực **không cần restart**
- [x] Upload mp4/ảnh thật lên Drive trả `fileId`, `webViewLink`, `thumbnailLink`
- [x] Upload `.exe` ⇒ 400; upload quá `maxUploadMb` ⇒ 400
- [x] **(bổ sung)** OAuth2: bấm "Kết nối Google" → consent → callback lưu refresh token
      mã hoá + email tài khoản, upload dùng ngay không cần restart
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

- **Ngày xong:** 2026-07-22 (bổ sung OAuth2 + bỏ driver `fake`: 2026-07-24)
- **File chính:** `backend/src/modules/settings/`, `backend/src/infra/drive/`,
  `backend/src/modules/media/`, `backend/src/infra/crypto/crypto.service.ts`,
  `frontend/src/pages/SettingsPage.tsx`
- **Khác thiết kế ban đầu:** config Drive chuyển từ `.env` sang bảng `app_settings`
  (env còn là fallback) → ADR-014. Thêm màn hình "Cài đặt chung" ngoài plan gốc.
  Sau đó thêm **2 authMode** (service_account/oauth2, ADR-016) và **bỏ hẳn driver
  `fake`** (ADR-017) — xem [plans/03c-drive-auth-modes.md](../03c-drive-auth-modes.md).
- **Test:** xem `contexts.md` §5
- **Còn nợ:** tab Facebook/Hệ thống trong Cài đặt chung chưa làm (chờ M4)
