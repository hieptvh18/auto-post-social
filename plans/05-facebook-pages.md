# Plan 05 — Facebook Pages + mã hóa token

**Milestone:** M4
**Trạng thái:** ✅
**Phụ thuộc:** Plan 02
**Spec:** `docs/04-api-spec.md` §3, `docs/02-architecture.md` §7.3

---

## 1. Mục tiêu

ADMIN quản lý được danh sách Facebook Page kèm access token lưu mã hóa; các module
khác lấy được token đã giải mã để publish.

## 2. Ngoài phạm vi

OAuth flow lấy token tự động từ Facebook, auto-refresh token, đồng bộ danh sách page
từ Meta. MVP: nhập token thủ công.

## 3. Thiết kế

**Endpoint**

| Method | Path | Quyền |
|--------|------|-------|
| GET | `/pages` | mọi user đã đăng nhập (token **masked**) |
| POST/PUT/DELETE | `/pages` `/pages/:id` | ADMIN (`pages:manage`) |

DELETE = soft delete (`isActive=false`) vì `publish_jobs` tham chiếu tới page.

**Crypto** — `common/utils/crypto.util.ts`, AES-256-GCM, key `TOKEN_ENCRYPTION_KEY`
(32 byte hex), output `base64(iv):base64(authTag):base64(ciphertext)`.

```typescript
encryptToken(plain: string): string
decryptToken(enc: string): string   // ciphertext hỏng/sai key ⇒ ném DomainError
maskToken(plain: string): string    // '••••' + 4 ký tự cuối
```

Token **không bao giờ** xuất hiện trong response, log, hay audit `afterValue`.
`FacebookPagesService.getDecryptedToken(pageId)` là lối vào duy nhất để lấy token
plaintext, chỉ publisher gọi.

## 4. Task

- [x] `crypto.util.ts`: encrypt / decrypt / mask — dùng lại `CryptoService` có sẵn
      (đã encrypt/decrypt từ M2) + thêm `common/utils/token-mask.util.ts` (`maskToken`)
- [x] Repository + service + controller cho pages
- [x] `pageId` unique ⇒ trùng 409 với message rõ
- [x] Mapper loại `accessTokenEnc`, trả `accessTokenMasked` + `tokenExpireAt` + `autopostEnabled`
- [x] `getDecryptedToken(pageId)` — page inactive ⇒ ném lỗi
- [x] Audit `PAGE_CREATE`, `PAGE_UPDATE`, `PAGE_TOKEN_UPDATE` (không ghi giá trị token)
- [x] Env `TOKEN_ENCRYPTION_KEY` đã có sẵn từ M2 (`crypto.service.ts`) — không cần thêm
- [x] Unit test **bắt buộc cho phần crypto** (dễ sai, ảnh hưởng bảo mật): mask đúng,
      mapper **không lộ token** (response lẫn audit log), `getDecryptedToken` với page
      inactive, list vẫn trả được khi token cũ không giải mã (đổi khoá) thay vì crash.
      Round-trip/ciphertext hỏng/sai key đã có sẵn ở `crypto.service.spec.ts` (M2).
- [x] `npm run lint && npm run build` xanh, `npm run test` xanh (286 test)
- [x] Cập nhật `contexts.md`

## 4b. Nối frontend — PageManagementPage

Làm ngay sau khi backend xanh, test tay trên UI thật. Hạ tầng chung đã có ở Plan 03b.

- [x] `src/api/pages.api.ts`: list (token đã mask), create/update/delete
- [x] `src/hooks/usePages.ts`: query key + mutation, `invalidateQueries` sau mutation
- [x] `PageManagementPage`: tách `RealPageManagementPage` (API thật) khỏi
      `MockPageManagementPage` (giữ nguyên mock), chọn theo `VITE_USE_MOCK` — cùng
      pattern với `ContentManagementPage` (Plan 04). Form nhập token; hiện token dạng
      mask trong bảng; cột Actions (sửa/xoá) chỉ render khi `can(role, 'pages:manage')`
- [x] Type response ở `src/types/` (`FacebookPageResponse`, `Create/UpdateFacebookPageBody`)
- [x] `npm run lint && npm run build` (frontend) xanh

## 5. Điều kiện nghiệm thu

- [x] ADMIN tạo page với token → DB lưu chuỗi mã hóa, không phải plaintext
      (smoke test curl: `accessTokenEnc` trong DB decrypt lại đúng plaintext gốc)
- [x] `GET /pages` trả token dạng mask, mọi role đọc được (EDITOR test qua curl OK)
- [x] EDITOR gọi `POST /pages` ⇒ 403 (smoke test curl xác nhận)
- [x] `grep` log không thấy token plaintext (kiểm tra log dev server sau smoke test)
- [ ] **Trên UI thật** (`VITE_USE_MOCK=false`): ADMIN tạo page → thấy trong bảng
      với token mask; EDITOR không thao tác được (403) — **chưa test qua trình duyệt**,
      chỉ mới test API qua curl + `npm run build` xanh. Cần smoke test tay trên UI.

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Đổi `TOKEN_ENCRYPTION_KEY` ⇒ mọi token cũ chết | Ghi cảnh báo trong `.env.example`; decrypt lỗi ⇒ message "cần nhập lại token" |
| Token lọt vào audit log | Test khẳng định `afterValue` không chứa key token |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:** 2026-07-24
- **File chính:** `backend/src/modules/facebook-pages/` (repository/service/controller/
  dto/mapper/module), `backend/src/common/utils/token-mask.util.ts`,
  `frontend/src/api/pages.api.ts`, `frontend/src/hooks/usePages.ts`,
  `frontend/src/pages/PageManagementPage.tsx`
- **Khác thiết kế ban đầu:** không tạo `crypto.util.ts` riêng — dùng lại
  `infra/crypto/crypto.service.ts` (đã có sẵn từ M2, cùng thuật toán AES-256-GCM
  format `iv:authTag:ciphertext`) để tránh trùng lặp logi encrypt/decrypt; chỉ thêm
  `maskToken` (pure function) làm util riêng. `pageId` không sửa được ở `PUT` (chỉ set
  lúc tạo) — input disabled trên UI khi đang edit.
- **Test:** BE 286 test (12 test mới cho `FacebookPagesService`: mask đúng, không lộ
  token trong response/audit log, `getDecryptedToken` chặn page inactive, list vẫn trả
  được khi token cũ không giải mã do đổi khoá, conflict 409 khi trùng `pageId`) — lint +
  build xanh. FE lint + build xanh. Đã smoke test qua curl với backend thật: login →
  tạo page → mask đúng 4 ký tự cuối → sửa page/đổi token → mask cập nhật → trùng pageId
  ⇒ 409 → xoá (soft, `isActive=false`, vẫn còn trong list) → EDITOR đọc được list nhưng
  `POST` bị 403 → grep log dev server không thấy token plaintext.
- **Còn nợ:** chưa smoke test UI thật qua trình duyệt (chỉ mới test API qua curl +
  `npm run build` xanh) — cần làm khi có phiên làm việc tiếp theo trước khi coi milestone
  hoàn toàn Done theo rule 00.
