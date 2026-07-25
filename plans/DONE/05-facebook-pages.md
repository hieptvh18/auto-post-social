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

---

## 8. Bổ sung 2026-07-25 — Test kết nối Page + Search danh sách

Yêu cầu phát sinh từ user (ghi theo rule 03: không âm thầm làm thêm):
popup thêm/sửa Page cần nút **"Test kết nối"** gửi thử request tới Page để biết
cấu hình đúng chưa; bảng danh sách cần **ô tìm kiếm**.

### Backend

- [x] `src/infra/facebook/` — adapter Meta Graph đầu tiên của dự án (rule 01: external
      API luôn sau interface trong `infra/`): `facebook-graph.interface.ts` (`FacebookGraph`,
      `FacebookPageProbe`), `facebook-graph.client.ts` (fetch + timeout 10s),
      `facebook.errors.ts` (`FacebookGraphError` + `mapFacebookError`), `facebook.module.ts`
- [x] `POST /pages/test-connection` (ADMIN) — test `pageId` + token **chưa lưu**
- [x] `POST /pages/:id/test-connection` (ADMIN) — test page đã lưu bằng token trong DB
- [x] Service `testConnection` / `testSavedPageConnection` / `probe` — trả
      `FacebookConnectionResult { ok, pageId, pageName, category, canPost, message }`
- [x] Test: 11 case mới (7 service + client 9 case map lỗi Graph) — tổng BE 336 test xanh

### Frontend

- [x] `pages.api.ts`: `testConnection` / `testSavedConnection`; hook `useTestPageConnection`
- [x] Popup: footer thêm nút "Test kết nối", kết quả hiện bằng `Alert` ngay trong modal
- [x] Bảng danh sách: ô search lọc theo tên Page / Page ID (client-side, `GET /pages`
      trả toàn bộ nên không cần đổi API) — áp cho cả bản Real lẫn Mock

### Quyết định

- Gọi `GET /{pageId}?fields=id,name,category,tasks`: `tasks` cho biết token có quyền
  `CREATE_CONTENT` hay không ⇒ phát hiện sớm token đọc được page nhưng **không đăng
  bài được**, thay vì đợi tới lúc bot publish mới lỗi.
- Token gửi qua header `Authorization: Bearer`, **không** qua query string — tránh
  token lọt vào access log.
- Lỗi Graph ⇒ trả `200 { ok:false, message }` chứ không ném exception: đây là nút kiểm
  tra cấu hình, user cần đọc lý do ngay trên form. Lỗi không phải của Graph vẫn ném lên.
- `testSavedPageConnection` **không** dùng `getDecryptedToken` vì hàm đó chặn page
  inactive — page đang tạm dừng vẫn phải test được cấu hình.
- Không ghi audit cho thao tác test (chỉ đọc, không đổi dữ liệu).
- Chưa dùng `META_APP_ID`/`META_APP_SECRET` — chỉ cần Page Access Token. Không thêm
  biến env mới (`META_GRAPH_API_VERSION` đã có sẵn) ⇒ `.env.example` không đổi.

### Còn nợ

- [ ] Smoke test với **Page + token Facebook thật** (chưa có token thật để thử) — hiện
      mới phủ bằng unit test mock `fetch`.
- [ ] Smoke test UI thật (chung với mục 5 ở trên).

### Sửa 2026-07-25 (sau khi gọi Graph thật lần đầu)

Test với Page + token thật lộ ra 2 lỗi mà unit test mock `fetch` không thể thấy:

1. **Hỏi sai field.** Code hỏi `fields=id,name,category,tasks`, nhưng `tasks` **không
   tồn tại** trên page node khi dùng Page token — nó chỉ có ở edge `/me/accounts`
   (ngữ cảnh user token). Graph trả `(#100) nonexisting field (tasks)` ⇒ hỏng cả lời
   gọi. Đã bỏ `tasks`, chuyển sang xác định quyền đăng bài qua `scopes` của `/debug_token`.
2. **Thông báo lỗi đánh lạc hướng.** Token của page A dùng để đọc page B ⇒ Graph trả
   `(#10)`, code map thành "thiếu quyền" khiến user đi tìm quyền trong khi lỗi thật là
   **sai Page ID**. Đã thêm `debugToken()` gọi **trước**: biết chính xác token thuộc page
   nào, loại gì, còn hạn bao lâu.

- [x] `FacebookGraph.debugToken()` — trả `type`, `isValid`, `profileId`, `scopes`, `expiresAt`
- [x] `probe()` kiểm theo thứ tự: token hợp lệ → đúng page → đúng loại PAGE → đọc page → scope
- [x] Cảnh báo hạn token trong message (`expires_at=0` = vĩnh viễn, System User)
- [x] Response thêm `tokenType` + `expiresAt`; UI hiện 2 field này dưới Alert
- [x] BE 343 test xanh (13 case cho probe + 3 case cho `debugToken`), lint/build 2 phía xanh

**Bài học:** adapter external API phải được gọi thật ít nhất 1 lần trước khi coi là xong.
Unit test mock `fetch` chỉ chứng minh code xử lý đúng *giả định của mình về* API, không
chứng minh giả định đó đúng.

### Sửa lần 2 — 2026-07-25 (test với token System User thật)

- **Bug:** `debugToken()` chỉ nhận `PAGE|USER|APP` nên token System User (Graph trả
  `type: "SYSTEM_USER"`) bị quy về `UNKNOWN` ⇒ message sai. Đã bổ sung `SYSTEM_USER`.
- **Cải tiến chẩn đoán:** token không phải PAGE thì gọi thêm `/me/accounts` để phân biệt
  3 tình huống rất khác nhau mà trước đó gộp làm một:
  1. danh sách rỗng ⇒ tài khoản **chưa được gán Page** trong Business settings (nguyên
     nhân thật đứng sau lỗi `(#10)`),
  2. có page khác nhưng không có page đang cấu hình ⇒ liệt kê ra để đối chiếu Page ID,
  3. có đúng page ⇒ chỉ còn thiếu bước đổi sang Page token.
- [x] `FacebookGraph.listPages()` + `explainNonPageToken()` trong service
- [x] BE 346 test xanh (thêm 4 case), lint/build 2 phía xanh
