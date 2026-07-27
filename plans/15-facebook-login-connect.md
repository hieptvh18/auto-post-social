# Plan 15 — Kết nối Facebook Page bằng đăng nhập (thay cho dán token tay)

**Milestone:** M10 (Phase 2)
**Trạng thái:** 🟡 code + test xong (2026-07-27), chưa chạy với Meta app thật
**Phụ thuộc:** `DONE/05-facebook-pages.md` (module page + crypto token) · `DONE/03c-drive-auth-modes.md` (mẫu OAuth callback + state)
**Spec tham chiếu:** `docs/03` §Facebook Pages · `.claude/rules/01` §Bảo mật · ADR-014, ADR-016

---

## 1. Mục tiêu

Hôm nay muốn thêm một Page, user phải tự đi lấy Page Access Token ở Graph Explorer
rồi dán vào form — token loại này thường ngắn hạn, chết lặng sau vài giờ và là lý do
`contexts.md` §6 mục 10 vẫn chưa đăng thật lên Page được.

Sau feature này: user **bấm "Kết nối bằng Facebook"**, đăng nhập bằng chính tài khoản
cá nhân đã được doanh nghiệp share quyền trên Page, chọn page trong danh sách, hệ thống
tự lấy **Page token vĩnh viễn** (`expires_at = 0`) và lưu mã hoá như hiện tại.
**Không cần System User, không cần quyền admin Business Manager.**

### Nguyên lý kỹ thuật (cơ sở của cả plan)

```text
short-lived user token (1–2h, từ dialog OAuth)
   │  GET /oauth/access_token?grant_type=fb_exchange_token
   ▼
long-lived user token (~60 ngày)
   │  GET /me/accounts?fields=id,name,access_token,tasks
   ▼
Page token — KHÔNG có hạn (expires_at = 0)   ← thứ bot cần
```

Page token dẫn xuất từ user token **đã long-lived** thì không hết hạn. Nó chỉ chết khi:
đổi mật khẩu FB · gỡ app khỏi tài khoản · bị gỡ quyền khỏi Page · app bị Meta khoá.
Đây là phương án gần tương đương System User mà không cần quyền sở hữu Business.

## 2. Ngoài phạm vi

- **Không** bỏ luồng dán token tay. Hai nguồn token cùng tồn tại (`connect_mode`) —
  dán tay vẫn cần cho trường hợp doanh nghiệp cấp sẵn token System User.
- **Không** làm auto-refresh nền cho user token 60 ngày. MVP chỉ **cảnh báo** + nút
  "Kết nối lại". (Ghi nợ, xem §6.)
- **Không** đụng Instagram, không xin scope Insights/ads.
- **Không** đổi luồng publisher — publisher vẫn chỉ đọc `facebook_pages.access_token_enc`.
- **Không** làm App Review hộ user (việc ngoài code, xem §6 rủi ro R1).

## 3. Thiết kế

### 3.1 Chọn server-side redirect, không dùng JS SDK

Giả định đã chốt: **authorization-code flow phía server**, đúng khuôn mẫu `DriveOAuthService`
đã chạy tốt ở plan 03c. Lý do: `appSecret` không bao giờ chạm frontend, và bước đổi
long-lived token bắt buộc cần secret ⇒ dù dùng JS SDK vẫn phải quay về server. Dùng SDK
chỉ thêm một phụ thuộc script bên thứ ba mà không giảm được việc gì.

### 3.2 App credentials để ở đâu

Theo **ADR-014** (không hardcode key trong `.env`, sửa được từ UI không restart):
lưu trong `app_settings` với khoá mới `facebook_app`.

```ts
// settings.types.ts
SettingKey.FACEBOOK_APP = 'facebook_app'

interface FacebookAppSettingsValue {
  appId: string | null;
  appSecretEnc: string | null;   // AES-256-GCM, không bao giờ ra khỏi service
}
```

⇒ **Không thêm biến `.env` nào.** `redirectUri` suy ra từ `appBaseUrl` + `apiPrefix`
giống Drive. `META_GRAPH_API_VERSION` giữ nguyên trong `.env`.

### 3.3 Schema (bắt buộc cập nhật `erd.md` cùng thay đổi — rule 05)

Bảng mới — một lần đăng nhập FB = một dòng, nhiều page trỏ vào:

```prisma
model FacebookConnection {
  id            String    @id @default(uuid()) @db.Uuid
  fbUserId      String    @unique @map("fb_user_id")
  fbUserName    String?   @map("fb_user_name")
  userTokenEnc  String    @map("user_token_enc") @db.Text   // long-lived user token
  tokenExpireAt DateTime? @map("token_expire_at")           // ~60 ngày
  scopes        String[]  @map("scopes")
  revokedAt     DateTime? @map("revoked_at")
  connectedById String    @map("connected_by") @db.Uuid
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  connectedBy User           @relation(fields: [connectedById], references: [id])
  pages       FacebookPage[]

  @@map("facebook_connections")
}
```

Thêm vào `FacebookPage`:

| Cột | Kiểu | Ý nghĩa |
|-----|------|---------|
| `connection_id` | uuid? FK → `facebook_connections` | null = token dán tay |
| `connect_mode` | enum `FacebookConnectMode` default `MANUAL_TOKEN` | nguồn token, hiện trên UI |

```prisma
enum FacebookConnectMode { MANUAL_TOKEN  FB_LOGIN }
```

Lý do giữ user token thay vì vứt sau khi lấy page token: cần nó để **đồng bộ lại**
danh sách page và **lấy lại page token** khi user được share thêm page mới, mà không
bắt đăng nhập lại.

### 3.4 Bổ sung `FacebookGraph` (infra)

```ts
/** Đổi short-lived → long-lived user token (~60 ngày). Cần appId + appSecret. */
exchangeLongLivedUserToken(
  shortLivedToken: string,
  appId: string,
  appSecret: string,
): Promise<{ token: string; expiresAt: Date | null }>;

/** `/me` — biết token thuộc tài khoản FB nào. */
getMe(userToken: string): Promise<{ id: string; name: string | null }>;

/** Như listPages() nhưng KÈM access_token + tasks của từng page. */
listPagesWithTokens(userToken: string): Promise<FacebookPageWithToken[]>;
```

`FacebookPageWithToken = { id, name, category, accessToken, tasks: string[] }`.
`tasks` chứa `CREATE_CONTENT` ⇒ tài khoản thực sự đăng bài được trên page đó — dùng
để chặn import nhầm page chỉ có quyền xem (khỏi phải chờ tới lúc bot chạy mới biết).

**Bảo mật:** mọi lời gọi bằng user/page token phải kèm `appsecret_proof` (HMAC-SHA256
của token với appSecret) khi app bật yêu cầu này. Token đi header `Authorization`, giữ
đúng quy ước hiện có trong `facebook-graph.client.ts`. **Cấm log URL và cấm log token.**

### 3.5 Endpoint

| Method | Path | Quyền | Việc |
|--------|------|-------|------|
| GET | `/settings/facebook-app` | `settings:manage` | `{ appId, hasAppSecret, redirectUri, updatedAt }` — redirectUri để user copy vào Meta dashboard |
| PUT | `/settings/facebook-app` | `settings:manage` | Lưu appId + appSecret (mã hoá) |
| GET | `/facebook-pages/connect/url` | `pages:manage` | Trả URL dialog OAuth + tạo `state` single-use |
| GET | `/facebook-pages/connect/callback` | `@Public()` | Meta redirect về; đổi code → long-lived → lưu connection → redirect FE `/pages?fb_connect=success` |
| GET | `/facebook-pages/connections` | `pages:manage` | Danh sách kết nối (tài khoản FB, hạn token, số page) |
| GET | `/facebook-pages/connections/:id/candidates` | `pages:manage` | Page mà tài khoản thấy được + cờ `alreadyAdded`, `canPost` |
| POST | `/facebook-pages/connections/:id/import` | `pages:manage` | `{ pageIds: string[] }` → tạo/cập nhật `facebook_pages` |
| POST | `/facebook-pages/:id/refresh-token` | `pages:manage` | Lấy lại page token từ connection (chỉ page `FB_LOGIN`) |
| DELETE | `/facebook-pages/connections/:id` | `pages:manage` | Ngắt kết nối: `revokedAt`, xoá `user_token_enc`; page giữ nguyên token đang chạy |

`state` chống CSRF: `Map` in-memory, single-use, TTL 10 phút — **copy đúng cơ chế
`DriveOAuthService`**, không phát minh lại.

Scope xin trong dialog: `pages_show_list`, `pages_read_engagement`,
`pages_manage_posts`, `business_management`.

### 3.6 Luật import (chỗ dễ sai nhất)

1. `pageId` chưa có ⇒ tạo mới, `connect_mode = FB_LOGIN`, gán `connection_id`.
2. `pageId` đã có và **đang xoá mềm** ⇒ hồi sinh (dùng lại `revive()` sẵn có).
3. `pageId` đã có, `connect_mode = FB_LOGIN` ⇒ **ghi đè token** (đây là refresh).
4. `pageId` đã có, `connect_mode = MANUAL_TOKEN` ⇒ **không tự ghi đè**, trả về trạng
   thái `needsConfirm` để UI hỏi "thay token dán tay bằng token đăng nhập?".
   Ghi đè token System User đang chạy tốt bằng token cá nhân là hạ cấp độ bền — phải
   do user quyết, không phải hệ thống.
5. Page không có `CREATE_CONTENT` trong `tasks` ⇒ từ chối import, nói rõ lý do.

Mọi nhánh đều ghi audit: thêm `AuditAction.PAGE_CONNECT_FB`, `PAGE_CONNECT_REVOKE`.
Đã có sẵn `PAGE_TOKEN_UPDATE` cho nhánh 3.

### 3.7 Frontend — `PageManagementPage`

- Nút **"Kết nối bằng Facebook"** cạnh "Thêm Page": gọi `/connect/url` → `window.location`.
- Về lại `/pages?fb_connect=success` ⇒ mở luôn **modal chọn page** (Table + checkbox,
  cột: tên page, ID, đã thêm chưa, đăng bài được chưa). Page thiếu `CREATE_CONTENT`:
  disable checkbox + tooltip lý do.
- Cột mới **"Nguồn token"**: Tag `Đăng nhập FB` / `Dán tay`. Page `FB_LOGIN` có thêm
  nút "Lấy lại token".
- Trang `/settings` thêm card **"Facebook App"** (chỉ ADMIN): appId, appSecret, và ô
  **redirect URI chỉ đọc kèm nút copy** — dán thiếu/sai chỗ này là lỗi số 1 khi dựng OAuth.
- API layer `src/api/pages.api.ts` + hook; mọi mutation `invalidateQueries(['pages'])`.

## 4. Task

### Backend — schema & infra
- [x] `schema.prisma`: model `FacebookConnection`, enum `FacebookConnectMode`, 2 cột mới trên `FacebookPage`
- [x] **Cập nhật `erd.md`** (bảng mới + cột mới + enum + index + lịch sử thay đổi) — làm **trước** migrate
- [x] `npx prisma migrate dev --name facebook_login_connection` + `npm run prisma:generate`
- [x] `facebook-graph.interface.ts` + `facebook-graph.client.ts`: `exchangeLongLivedUserToken`, `getMe`, `listPagesWithTokens`, helper `appsecret_proof`
- [x] Map lỗi Meta hay gặp thành thông báo tiếng Việt trong `facebook.errors.ts`: `OAuthException 190` (token chết), `(#200)` (thiếu scope), `(#10)` (chưa được gán page)

### Backend — settings
- [x] `SettingKey.FACEBOOK_APP` + `FacebookAppSettingsValue` + `getFacebookAppCredentials()` trong `SettingsService`
- [x] `GET/PUT /settings/facebook-app` (mask secret, trả `redirectUri`)

### Backend — module page
- [x] `facebook-connections.repository.ts` (nơi duy nhất query bảng mới)
- [x] `facebook-connect.service.ts`: `buildAuthUrl` · `handleCallback` · `listCandidates` · `importPages` · `refreshPageToken` · `revoke`
- [x] `facebook-connect.controller.ts` (callback `@Public()` + `@ApiExcludeController` tách riêng như `DriveOAuthController`)
- [x] `FacebookPagesRepository`: filter/ghi `connectionId`, `connectMode`
- [x] Mapper trả thêm `connectMode`, `connectedFbUser` — **kiểm lại mapper không lộ token**
- [x] 2 audit action mới

### Backend — test (vùng bắt buộc: crypto/token — rule 02)
- [x] `state` single-use: dùng lại lần 2 ⇒ 400; quá TTL ⇒ 400
- [x] `handleCallback` lưu user token **đã mã hoá**, đúng `fbUserId`, đúng `expiresAt`
- [x] `exchangeLongLivedUserToken` map đúng `expires_in` → `Date`; Meta trả lỗi ⇒ domain error, không rò axios/fetch error
- [x] `importPages`: cả 5 nhánh §3.6 (tạo mới · hồi sinh · ghi đè FB_LOGIN · chặn MANUAL_TOKEN ⇒ `needsConfirm` · thiếu `CREATE_CONTENT` ⇒ từ chối)
- [x] Import xong: page token trong DB **decrypt ra đúng** token Graph trả về
- [x] `revoke` xoá `user_token_enc` nhưng **không** đụng token của các page đang chạy
- [x] Mapper/response của connection + page **không** chứa token thô (assert âm)

### Frontend
- [x] `pages.api.ts` + hook cho 6 endpoint mới
- [x] Nút "Kết nối bằng Facebook" + xử lý query `?fb_connect=`
- [x] Modal chọn page (disable page không đăng bài được)
- [x] Cột "Nguồn token" + nút "Lấy lại token"
- [x] Card "Facebook App" trong `SettingsPage` (có nút copy redirect URI)
- [x] Cảnh báo user token còn <7 ngày (dùng lại pattern `expiryNote` của service)

### Chốt
- [x] `npm run lint && npm run build` xanh cả BE + FE
- [x] `npm run test` xanh
- [x] `.env.example`: **không đổi** (đã kiểm — mọi cấu hình mới nằm trong `app_settings`)
- [x] Cập nhật `contexts.md` (§4, §5, §6 mục 19, ADR-018)
- [ ] `git mv plans/15-*.md plans/DONE/` — **chờ nghiệm thu §5 với Meta app thật**

## 5. Điều kiện nghiệm thu

- [ ] Nhập App ID/Secret ở `/settings` → bấm "Kết nối bằng Facebook" → đăng nhập bằng
      tài khoản **chỉ được share quyền** trên page doanh nghiệp → thấy đúng danh sách page
- [ ] Chọn 1 page → import → `/pages` hiện page đó, Tag "Đăng nhập FB"
- [ ] Bấm "Test kết nối" trên page vừa import ⇒ `ok: true`, `tokenType: PAGE`,
      **`expiresAt: null`** ← đây là bằng chứng token vĩnh viễn, không có nó là làm sai
- [ ] Tạo slot → tới giờ Bot **đăng thật lên Page** (trả nốt nợ `contexts.md` §6 mục 10)
- [ ] Page dán tay cũ vẫn chạy nguyên, không bị đụng
- [ ] Không có token thô nào trong log và trong bất kỳ response nào

## 6. Rủi ro

| # | Rủi ro | Cách xử lý |
|---|--------|-----------|
| R1 | `pages_manage_posts` cần **App Review** với user thường | Tool nội bộ: thêm tài khoản FB của user vào app với role **Admin/Developer/Tester** ⇒ dùng được scope ngay, không cần review. Ghi rõ trong `GuidePage` + báo user trước khi code |
| R2 | User token 60 ngày hết hạn ⇒ không đồng bộ/lấy lại token page được (page token đã lưu vẫn sống) | Hiển thị hạn + cảnh báo <7 ngày; nút "Kết nối lại" một bước. Auto-refresh nền ghi nợ |
| R3 | Đổi mật khẩu FB / gỡ app ⇒ **mọi** page token chết cùng lúc | Publisher bắt `OAuthException 190` ⇒ job FAILED với message chỉ thẳng "vào /pages bấm Kết nối lại"; Dashboard health đã có cảnh báo token, nối thêm case này |
| R4 | Doanh nghiệp gỡ quyền user khỏi Page | Không tránh được với mọi phương án không-System-User. Chỉ cần báo lỗi rõ ràng |
| R5 | Ghi đè nhầm token System User đang chạy tốt | Luật §3.6 nhánh 4 — bắt user xác nhận, có test |
| R6 | `state` in-memory mất khi restart giữa chừng flow | Chấp nhận: TTL 10 phút, user bấm lại. Giống Drive OAuth, không thêm bảng cho việc này |
| R7 | Redirect URI khai trong Meta app lệch với `appBaseUrl` ⇒ lỗi khó hiểu | UI hiện sẵn redirect URI chính xác kèm nút copy (§3.7) |

---

## 7. Kết quả

- **Ngày code xong:** 2026-07-27 (chưa nghiệm thu §5 — cần Meta app thật)
- **File chính:**
  - BE: `modules/facebook-pages/facebook-connect.service.ts` · `facebook-connect.controller.ts` ·
    `facebook-connections.repository.ts` · `facebook-connection.mapper.ts` ·
    `infra/facebook/facebook-graph.client.ts` · `common/utils/facebook-redirect.util.ts` ·
    `modules/settings/settings.service.ts`
  - FE: `components/pages/{ConnectPagesModal,ConnectionsCard,FacebookAppSettings}.tsx` ·
    `pages/PageManagementPage.tsx` · `api/pages.api.ts` · `hooks/usePages.ts`
- **Khác thiết kế ban đầu:**
  1. **Đường dẫn endpoint là `/pages/connect/...`, không phải `/facebook-pages/connect/...`**
     như viết ở §3.5 — controller sẵn có đã dùng prefix `pages`, đổi sẽ vỡ FE và Swagger.
  2. Thêm `exchangeCodeForUserToken()` vào interface (§3.4 quên bước đổi `code` → token
     ngắn hạn, chỉ liệt kê bước đổi sang dài hạn).
  3. `user_token_enc` để **nullable** thay vì `String` — ngắt kết nối xoá hẳn token nhưng
     vẫn giữ dòng làm dấu vết.
  4. `getMe`/`listPagesWithTokens` nhận thêm `appSecret?` để gắn `appsecret_proof`.
  5. `META_APP_ID`/`META_APP_SECRET` đã có sẵn trong `.env.example` từ trước ⇒ giữ làm
     **fallback bootstrap** thay vì chỉ đọc `app_settings`. Vẫn đúng cam kết "không thêm
     biến `.env` mới".
  6. Danh sách kết nối để thành **card ngay trong `/pages`** thay vì tab riêng — chỉ 1–2
     dòng dữ liệu, tách tab là thừa.
- **Test:** BE 590 test xanh (+41: 31 service + 10 graph client) · FE 35 test cũ xanh ·
  lint + build 2 phía xanh.
- **Còn nợ:**
  1. Nghiệm thu §5 với Meta app thật (`contexts.md` §6 mục 19) — chặn bởi việc user phải
     tạo app + tự thêm vai trò Tester.
  2. Auto-refresh nền user token 60 ngày (cố ý ngoài phạm vi, §2).
  3. Publisher chưa map riêng `OAuthException 190` thành câu "vào /pages bấm Kết nối lại"
     (R3) — hiện vẫn dùng message chung của `mapFacebookError`.
  4. `/me/accounts` chưa xử lý phân trang (giới hạn 100 page/lần).
