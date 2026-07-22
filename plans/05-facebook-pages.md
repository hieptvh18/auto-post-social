# Plan 05 — Facebook Pages + mã hóa token

**Milestone:** M4
**Trạng thái:** ⬜
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

- [ ] `crypto.util.ts`: encrypt / decrypt / mask
- [ ] Repository + service + controller cho pages
- [ ] `pageId` unique ⇒ trùng 400/409 với message rõ
- [ ] Mapper loại `accessTokenEnc`, trả `accessTokenMasked` + `tokenExpireAt` + `autopostEnabled`
- [ ] `getDecryptedToken(pageId)` — page inactive ⇒ ném lỗi
- [ ] Audit `PAGE_CREATE`, `PAGE_UPDATE`, `PAGE_TOKEN_UPDATE` (không ghi giá trị token)
- [ ] Thêm env `TOKEN_ENCRYPTION_KEY` vào `.env` + `.env.example` (kèm cách sinh key)
- [ ] Unit test 100%: crypto round-trip, ciphertext hỏng ⇒ lỗi, sai key ⇒ lỗi,
      mask đúng, service (trùng pageId, not found, soft delete, mapper không lộ token,
      getDecryptedToken với page inactive)
- [ ] `npm run lint && npm run test:cov && npm run build` xanh
- [ ] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [ ] ADMIN tạo page với token → DB lưu chuỗi mã hóa, không phải plaintext
- [ ] `GET /pages` trả token dạng mask, mọi role đọc được
- [ ] EDITOR gọi `POST /pages` ⇒ 403
- [ ] `grep` log không thấy token plaintext

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Đổi `TOKEN_ENCRYPTION_KEY` ⇒ mọi token cũ chết | Ghi cảnh báo trong `.env.example`; decrypt lỗi ⇒ message "cần nhập lại token" |
| Token lọt vào audit log | Test khẳng định `afterValue` không chứa key token |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:**
- **Còn nợ:**
