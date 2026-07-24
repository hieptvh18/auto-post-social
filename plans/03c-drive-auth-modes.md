# Plan 03c — Drive auth modes: Service Account (Shared Drive) ⟷ OAuth2 (Gmail free)

**Milestone:** M2 (mở rộng)
**Trạng thái:** 🟡 đang làm
**Phụ thuộc:** Plan 03 (Drive upload), ADR-014 (config động)
**Spec tham chiếu:** rule 01 §Bảo mật, rule 04 §Env, ADR-017 (thay ADR-003 — đã bỏ driver fake)

---

## 1. Mục tiêu

Service account **không có quota lưu trữ** ⇒ không upload được vào My Drive của Gmail
cá nhân (lỗi `403 Service Accounts do not have storage quota`). Cho phép ADMIN **chọn
switch** giữa 2 chế độ xác thực Drive trong "Cài đặt chung":

- **service_account** — dùng service account JSON + **Shared Drive** (Google Workspace).
- **oauth2** — xác thực bằng chính tài khoản Google của user (Gmail free), file thuộc
  sở hữu user, tính vào 15GB. Lấy refresh token qua **OAuth flow trong app**.

## 2. Ngoài phạm vi

- Không đụng Facebook/Meta.
- Không làm domain-wide delegation.
- Không đổi bảng DB (config nằm trong `app_settings` JSONB — không migration).
- Không refresh/rotate OAuth client tự động; user tự nhập client id/secret.

## 3. Thiết kế

### Config (app_settings['google_drive'], JSONB — secret mã hoá AES-256-GCM)

```ts
DriveSettingsValue {
  authMode: 'service_account' | 'oauth2'
  folderId: string | null
  // service_account
  serviceAccountJsonEnc: string | null
  // oauth2
  oauthClientId: string | null
  oauthClientSecretEnc: string | null
  oauthRefreshTokenEnc: string | null
  oauthAccountEmail: string | null   // hiển thị "đang kết nối tài khoản nào"
  maxUploadMb: number
}
```

### Endpoint (thêm)

- `GET  /settings/google-drive/oauth/url`  (ADMIN) → `{ url }` consent Google (state 1 lần).
- `GET  /settings/google-drive/oauth/callback?code&state` (**@Public**) → đổi code lấy
  refresh token, lưu mã hoá + email tài khoản, redirect về FE `/settings?drive_oauth=...`.

### Auth khi upload (GoogleDriveStorage)

- service_account: `GoogleAuth(credentials)` + **`supportsAllDrives: true`** trên
  create/get/delete để ghi được vào Shared Drive.
- oauth2: `OAuth2Client(clientId, clientSecret)` + `setCredentials({refresh_token})`.

### Env thêm

- `APP_BASE_URL` (mặc định `http://localhost:3100`) — dựng redirect_uri.
- `WEB_BASE_URL` (mặc định `http://localhost:5178`) — redirect browser về FE sau callback.

## 4. Task

- [x] `env.validation.ts`: enum `DriveAuthMode`, biến `APP_BASE_URL`, `WEB_BASE_URL`
- [x] `settings.types.ts`: mở rộng Value/Resolved/Response
- [x] `update-drive-settings.dto.ts`: `authMode`, `oauthClientId`, `oauthClientSecret`
- [x] `settings.service.ts`: lưu/mask theo mode, validate chéo theo mode
- [x] `google-drive.storage.ts`: `createDriveClient` 2 mode + `supportsAllDrives`
- [x] `drive-storage.factory.ts`: build theo authMode
- [x] `drive-oauth.service.ts` + `DriveOAuthController` (callback public) + `oauth/url`
- [x] `drive.errors.ts`: nhận diện lỗi quota qua message
- [x] FE `types`, `settings.api.ts` (thêm `getOauthUrl`), `SettingsPage.tsx` switch UI
- [x] Test BE: storage oauth2 build/upload, factory chọn mode, service validation
- [x] lint + build BE & FE xanh
- [x] `.env.example` (BE) thêm biến mới
- [x] contexts.md + erd note (app_settings value shape)
- [ ] Smoke test OAuth thật (còn nợ — cần OAuth Client của user)

## 5. Điều kiện nghiệm thu

- [ ] Chọn oauth2 → "Kết nối Google" → consent → quay lại thấy "Đã kết nối (email)"
- [ ] Upload ảnh/video ở "Quản lý Ảnh/Video Edit" → file lên Drive của user, không lỗi quota
- [ ] Chọn service_account + Shared Drive folder → upload OK (supportsAllDrives)
- [ ] Đổi mode có hiệu lực ngay, không restart (version bump)
- [ ] Non-ADMIN không gọi được oauth/url (403); callback không cần token nhưng cần state đúng

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Callback public bị lạm dụng | `state` ngẫu nhiên, TTL ngắn, single-use trong bộ nhớ |
| Refresh token không trả về | `access_type=offline` + `prompt=consent` |
| Gmail free vẫn không ghi được folder người khác | scope `drive`, folder thuộc chính user |
| Redirect URI lệch cấu hình Google | Lấy từ `APP_BASE_URL`, ghi rõ trong hướng dẫn |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:** code 2026-07-24 (chờ smoke test OAuth thật)
- **File chính:** `backend/src/modules/settings/{settings.service,drive-oauth.service,
  drive-oauth.controller}.ts`, `backend/src/infra/drive/{google-drive.storage,
  drive-storage.factory,drive.errors}.ts`, `frontend/src/pages/SettingsPage.tsx`,
  `frontend/src/api/settings.api.ts`
- **Khác thiết kế ban đầu:** không đổi — giữ đúng 2 mode + flow trong app.
- **Test:** BE 271 test (24 suite) xanh; FE 16 test Vitest xanh. lint/build cả hai xanh.
- **Còn nợ:** smoke test OAuth end-to-end với OAuth Client thật của user (đăng ký
  redirect URI `http://localhost:3100/api/settings/google-drive/oauth/callback`).
  Chưa `git mv` plan sang DONE (chờ nghiệm thu).
