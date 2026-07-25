# contexts.md — Trạng thái dự án Tool Auto FB

> **File này là bộ nhớ dài hạn của dự án.**
> Claude PHẢI đọc file này đầu mỗi session và cập nhật nó mỗi khi hoàn thành 1 module
> hoặc kết thúc session. Xem quy tắc cập nhật ở [.claude/rules/03-context-protocol.md](.claude/rules/03-context-protocol.md).

**Cập nhật lần cuối:** 2026-07-25
**Session gần nhất (mới nhất):** Bổ sung theo yêu cầu user cho trang **Cài đặt đăng bài
tự động** (plan 09): **filter theo FB Page** + **nút "Đăng bài thủ công"** — popup chọn
page, lọc danh mục/loại media, chọn 1 bài ảnh/video trong kho, sửa caption/hashtag lấy
sẵn từ bài rồi **đăng ngay lập tức** qua Graph API. Backend thêm module `manual-post`
(`POST /manual-post`, gác `autopost:manage`) và adapter publisher đầu tiên
`infra/facebook/facebook-publisher.client.ts` (ảnh `/{pageId}/photos`, video
`/{pageId}/videos` trên host `graph-video`). Đăng xong ghi `publish_jobs` + `content_page_assignments`
+ chuyển content sang `PUBLISHED` trong **một transaction**; lỗi Graph/Drive ⇒ job FAILED
+ 502 kèm message tiếng Việt. Không đụng schema ⇒ `erd.md` không đổi. BE 357 test xanh
(11 test mới), lint/build 2 phía xanh, FE 16 test cũ vẫn xanh. **Chưa đăng thật lên page**
— vẫn kẹt ở nợ §6 mục 10 (chưa có Page token).
**Session trước:** Bổ sung theo yêu cầu user cho trang **Facebook Pages**:
nút **"Test kết nối"** trong popup thêm/sửa Page + **ô search** trên bảng danh sách.
Tạo adapter Meta Graph đầu tiên của dự án `backend/src/infra/facebook/` (interface +
`FacebookGraphClient` dùng fetch + map lỗi Graph sang message tiếng Việt), 2 endpoint
`POST /pages/test-connection` (cấu hình chưa lưu) và `POST /pages/:id/test-connection`
(token đã lưu trong DB), cả hai gác `pages:manage`. Sai cấu hình trả `200 {ok:false,message}`
để form hiện lý do. Không đụng schema, không thêm biến env. Sau đó **gọi Graph thật** và
phát hiện 2 lỗi mock test không thấy: field `tasks` không tồn tại trên page node, và lỗi
`(#10)` bị map nhầm thành "thiếu quyền" trong khi lỗi thật là sai Page ID ⇒ thêm
`debugToken()` gọi trước, response thêm `tokenType`/`expiresAt`. BE 343 test xanh,
lint/build 2 phía xanh — xem plan 05 §8 + §7 cạm bẫy. **Còn thiếu Page token dài hạn
(System User) để chạy thật** — §6 mục 10.
**Trước đó:** Làm **M5 Cài đặt đăng bài tự động** (plan 06): module backend
`auto-post-configs` — **chỉ CRUD cấu hình**, phần logic auto đăng bài (cron picker +
BullMQ + publisher) tách hẳn thành module riêng ở plan 07 theo yêu cầu user.
5 endpoint theo docs/04 §6 (`GET /auto-post-configs`, `PATCH /auto-post-configs/:pageId`,
`POST /auto-post-configs/:pageId/slots`, `PATCH|DELETE /auto-post-slots/:slotId`), tất cả
gác `autopost:manage` (ADMIN + EDITOR). Không đụng schema ⇒ `erd.md` không đổi.
Nối FE `AutoPostSettingsPage` theo pattern Real/Mock split (`api/autoPost.api.ts`,
`hooks/useAutoPostConfigs.ts`). BE 318 test xanh (+32), lint/build 2 phía xanh,
**đã smoke test API qua curl với backend thật** nhưng **chưa smoke UI thật** — xem §6 mục 9.
Trước đó: **M4 Facebook Pages + token crypto** (plan 05): module
backend `facebook-pages` (repository/service/controller/dto/mapper) — tái dùng
`CryptoService` sẵn có từ M2 thay vì tạo `crypto.util.ts` riêng, thêm
`common/utils/token-mask.util.ts` (`maskToken`). `GET /pages` mọi role đọc được
(token luôn mask), `POST/PUT/DELETE` chỉ ADMIN (`pages:manage`), DELETE = soft
delete. Audit `PAGE_CREATE`/`PAGE_UPDATE`/`PAGE_TOKEN_UPDATE` không ghi giá trị
token. Nối FE `PageManagementPage` theo đúng pattern Real/Mock split của plan 04
(`api/pages.api.ts`, `hooks/usePages.ts`). BE 286 test xanh (12 test mới), lint/
build 2 phía xanh. **Đã smoke test qua curl với backend thật** (login → tạo/sửa/xoá
page → mask đúng → trùng pageId ⇒ 409 → EDITOR đọc được nhưng POST ⇒ 403 → grep log
không lộ token) nhưng **chưa smoke test UI thật qua trình duyệt** — xem §6.
Trước đó: smoke test OAuth2 Drive thật thành công (connect tài khoản Gmail qua UI)
sau khi đổi cổng backend dev từ 3100 → 3001 (khớp OAuth Client đã đăng ký ở Google
Console) — cập nhật `PORT`/`APP_BASE_URL` ở `.env`/`.env.example`/`env.validation.ts`
default + proxy Vite. Sau đó làm **M3 Content Assets giai đoạn 1** (CRUD cơ bản,
hoãn duyệt/isAds/phân bổ page sang giai đoạn 2, chốt với user 2026-07-24): module
backend `content-assets` (repository/service/controller/DTO, RBAC ownership
CONTENT-chỉ-bài-mình, xoá kèm file Drive) + nối FE `ContentManagementPage` (tách
`RealContentManagementPage` dùng API thật khỏi `MockContentManagementPage` giữ
nguyên mock, chọn theo `VITE_USE_MOCK`). Lint/build/test 2 phía xanh (BE 274 test,
FE 16 test) nhưng **chưa smoke test UI thật** — xem §6. Cũng sửa lại plan 03 (DONE)
cho khớp thực tế (bỏ driver `fake`, thêm OAuth2 — theo ADR-016/017 đã áp dụng nhưng
tài liệu cũ chưa cập nhật).

---

## 1. Ảnh chụp hiện trạng

| Thành phần | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| `docs/` | ✅ Hoàn thiện | Spec v3.0, không sửa khi code |
| `.claude/rules/` | ✅ Hoàn thiện | 6 rule: workflow, coding, testing, context, env, ERD |
| `plans/` | ✅ Hoàn thiện | 9 file plan feature + `_TEMPLATE.md` |
| `erd.md` | ✅ Thiết kế xong | Mermaid; **bắt buộc cập nhật khi đổi schema** |
| `frontend/` | 🟡 UI mock + auth thật + content CRUD + pages CRUD + auto-post CRUD | 10 page mock; **auth/login đã nối API thật** (M2.5). **`ContentManagementPage` giai đoạn 1 đã nối API thật** (upload+CRUD, chưa duyệt/phân bổ page). **`PageManagementPage` đã nối API thật** (CRUD + token mask). **`AutoPostSettingsPage` đã nối API thật** (CRUD mốc giờ + bật/tắt auto + filter page + đăng bài thủ công). Các trang còn lại vẫn mock. |
| `backend/` | 🟡 Đang xây | Khung + **auth/RBAC/users** + **settings/media (Drive)** + **content-assets giai đoạn 1 (CRUD)** + **facebook-pages (CRUD + token crypto)** + **auto-post-configs (CRUD slot)** + **manual-post (đăng tay ngay qua Graph)** xong. Còn duyệt/phân bổ page (content giai đoạn 2), **auto-post engine** (cron+queue+publisher, plan 07) |
| `worker/` | ⬜ Chưa có | Gộp vào backend process ở MVP (xem ADR-002) |
| `docker/` | ✅ Chạy được | Postgres 16 (55432) + Redis 7 (56379), cả hai healthy |

---

## 2. Scope MVP (đã chốt với user 2026-07-22)

Luồng duy nhất phải chạy được end-to-end:

```text
Upload video/ảnh → lưu Google Drive (folder cấu hình sẵn)
   → Quản lý FB Page (CRUD + token)
   → Cài đặt đăng bài tự động (slot: giờ + category + media type + số bài)
   → Cron picker lấy bài theo category/lịch → publish lên FB Page
```

**Trong scope:** auth/RBAC, users tối thiểu, media upload Drive, content-assets
(CRUD + duyệt + phân bổ page), facebook-pages, auto-post slots, cron scheduler +
picker query, BullMQ queue + processor, publish ảnh/video, timeline đọc job.

**Ngoài scope MVP:** dashboard aggregation nâng cao, queue monitor UI, audit log UI,
failed-jobs UI, reconciliation cron, Nginx/production compose.
(Vẫn ghi audit log ở backend vì rẻ, nhưng chưa làm màn hình.)

---

## 3. Quyết định kiến trúc (ADR)

| # | Quyết định | Lý do |
|---|-----------|-------|
| ADR-001 | Backend NestJS + Prisma, module theo feature | Theo docs/02 |
| ADR-002 | MVP chạy worker **cùng process** với API (`BullModule` + `@Processor`), tách process sau | Giảm hạ tầng; ranh giới module vẫn giữ nguyên nên tách sau chỉ là đổi bootstrap |
| ADR-003 | ~~Google Drive & Meta Graph bọc sau interface + có driver `fake` bật bằng env~~ **Bỏ 2026-07-24** — xem ADR-017 | Chạy/test local không cần credential thật |
| ADR-004 | ~~Coverage 100% bắt buộc cho service/domain~~ **Đổi 2026-07-23:** MVP ưu tiên tốc độ ⇒ chỉ test logic phức tạp/dễ sai khi cần; auto-post engine + crypto/token vẫn **bắt buộc** phủ kỹ, CRUD thuần không cần | User yêu cầu đi nhanh phase MVP; xem `.claude/rules/02-testing.md` §Chủ trương |
| ADR-005 | FE gọi API thật, giữ mock sau cờ `VITE_USE_MOCK` | Chốt với user |
| ADR-006 | Chống cron double-fire bằng bảng `slot_runs` UNIQUE(slot_id, run_date, run_time) thay vì Redis SETNX | Bền vững qua restart Redis, dễ test |
| ADR-007 | `.env` + `.env.example` tách riêng cho `backend/`, `frontend/`, `docker/` | Yêu cầu user; FE chỉ chứa biến public |
| ADR-008 | `erd.md` (mermaid) là bản đồ dữ liệu bắt buộc, cập nhật cùng lúc với mọi thay đổi schema | Yêu cầu user; tránh schema trôi khỏi tài liệu |
| ADR-009 | Dùng **Prisma 7** + driver adapter `@prisma/adapter-pg`; connection URL ở `prisma.config.ts`, không ở `schema.prisma` | Bản mới nhất khi scaffold. Docs viết theo cú pháp Prisma 5 — **đọc docs/03 phải quy đổi** |
| ADR-010 | Prisma Client sinh ra `backend/generated/prisma` (gitignored), import qua đường dẫn tương đối | Prisma 7 yêu cầu `output` tường minh; chạy `npm run prisma:generate` sau khi clone |
| ADR-011 | Port dev lệch chuẩn: Postgres 55432, Redis 56379, API 3100 | Máy dev đã chiếm 5432/6379/3000 |
| ADR-012 | Guard đăng ký **global** (`APP_GUARD`): mặc định mọi route cần auth, route công khai phải `@Public()` | Quên gắn guard ⇒ route lộ ra ngoài. Đảo mặc định lại thì quên `@Public()` chỉ gây 401, an toàn hơn nhiều |
| ADR-013 | Không dùng passport/JwtStrategy; `JwtAuthGuard` gọi thẳng `JwtService.verifyAsync` rồi **đọc lại user từ DB mỗi request** | Cần user bị khóa mất hiệu lực ngay, không chờ token hết hạn. Đã phải query DB thì strategy chỉ là lớp trung gian thừa |
| ADR-014 | Cấu hình Google Drive (driver, folder, service account) lưu **động trong bảng `app_settings`** (JSONB, secret mã hoá AES-256-GCM), sửa qua UI **"Cài đặt chung"** (`/settings`, chỉ ADMIN). `.env` chỉ còn là **fallback bootstrap** khi DB chưa có bản ghi | Yêu cầu user 2026-07-23: không muốn hardcode key/folder trong `.env`, cần đổi được từ UI không restart |
| ADR-016 | Drive `real` có **2 authMode**: `service_account` (chỉ ghi Shared Drive/Workspace) và `oauth2` (tài khoản Google, dùng được Gmail free). OAuth lấy refresh token bằng **flow trong app** (callback public bảo vệ bằng `state`). Chọn switch ở UI, lưu trong `app_settings` (secret mã hoá) | Service account **không có quota** ⇒ không upload được My Drive của Gmail cá nhân; Shared Drive cần trả phí. OAuth2 cho phép dev/user free vẫn chạy thật. Xem plan 03c |
| ADR-015 | **BE + API song song:** từ M3, mỗi milestone backend tự nối luôn FE trang tương ứng (bỏ mock cho trang đó) thay vì dồn nối API về cuối. Thêm milestone M2.5 dựng `api/client.ts` + `AuthContext` một lần dùng chung. M7 chỉ còn dọn phần sót + nghiệm thu end-to-end | Yêu cầu user 2026-07-23: xong milestone nào phải test tay được trên UI thật ngay, không chỉ curl/Swagger |
| ADR-017 | **Bỏ hẳn driver `fake`** cho Google Drive và Facebook (thay ADR-003). Xoá `DriverMode`, `FakeDriveStorage`, `DRIVE_DRIVER`/`FACEBOOK_DRIVER`. Drive luôn dùng `GoogleDriveStorage` (service_account hoặc oauth2); Facebook publisher (chưa code, plan 07) sẽ chỉ có driver thật khi làm | Yêu cầu user 2026-07-24: chỉ dùng cấu hình thật, không cần chế độ giả lập nữa. Unit test vẫn mock adapter qua interface (rule 02), không cần class fake riêng |

---

## 4. Tiến độ theo milestone

Xem kế hoạch chi tiết: [PLAN-MVP.md](./PLAN-MVP.md)

| Milestone | Trạng thái | Ngày xong |
|-----------|-----------|-----------|
| M0 — Scaffold + Docker + Prisma | ✅ | 2026-07-22 |
| M1 — Auth + RBAC + Users | ✅ | 2026-07-22 |
| M2 — Google Drive + Media upload | ✅ | 2026-07-23 |
| M2.5 — FE core (api client + AuthContext + Login) | 🟡 | code+test xong 2026-07-23, chờ smoke test BE thật |
| M3 — Content Assets + assignments (+ nối FE ContentPage) | 🟡 | giai đoạn 1 (CRUD) code xong 2026-07-24, chờ smoke test UI thật; giai đoạn 2 (duyệt/isAds/phân bổ page) chưa làm |
| M4 — Facebook Pages + token crypto (+ nối FE PagePage) | 🟡 | code+test xong 2026-07-24, chờ smoke test UI thật |
| M5 — Auto-post slots CRUD (+ nối FE AutoPostPage) | 🟡 | code+test+smoke API xong 2026-07-25, chờ smoke UI thật |
| M6 — Cron picker + BullMQ + publisher (+ nối FE Timeline) | ⬜ | |
| M7 — Dọn FE còn sót (Users, Settings) + nghiệm thu end-to-end | ⬜ | |

Ký hiệu: ⬜ chưa làm · 🟡 đang làm · ✅ xong (test pass + coverage đạt)

---

## 5. Nhật ký module đã hoàn thành

> Mỗi module xong ghi 1 mục ở đây theo mẫu trong `.claude/rules/03-context-protocol.md`.

### M0 Scaffold (Plan 01) — ✅ 2026-07-22

- **Phạm vi:** Backend NestJS chạy được. Docker Postgres+Redis, Prisma schema 8 bảng
  đã migrate, seed admin, health check, env validation, exception filter, correlationId.
  Endpoint: `GET /api/health`, `GET /api/health/ready`, Swagger `/api/docs`.
- **File chính:** `backend/src/config/`, `backend/src/infra/`, `backend/src/common/`,
  `backend/src/modules/health/`, `backend/prisma/schema.prisma`, `docker/docker-compose.yml`
- **Quyết định:** dùng Prisma 7 (khác docs viết theo Prisma 5) → xem ADR-009, ADR-010.
- **Test:** 65 test / 8 suite · coverage 100% cả 4 chỉ số · lint + build xanh
- **Còn nợ:** Pino logger (§6)

### M1 Auth + RBAC + Users (Plan 02) — ✅ 2026-07-22

- **Phạm vi:** `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`;
  CRUD `/users` (ADMIN, DELETE = soft delete). RBAC 3 role theo ma trận docs/05 §2.
  Audit log `USER_CREATE`/`USER_UPDATE`/`USER_DELETE`.
- **File chính:** `backend/src/common/permissions.ts`, `common/guards/`,
  `src/modules/auth/auth.service.ts`, `src/modules/users/users.service.ts`,
  `src/modules/audit/audit.service.ts`, `src/infra/crypto/password.service.ts`
- **Quyết định:** guard global + bỏ passport → ADR-012, ADR-013.
  Thêm `PasswordService` bọc bcrypt để test không phụ thuộc bcrypt thật.
- **Test:** 184 test / 18 suite · coverage service/domain 100% cả 4 chỉ số ·
  đã smoke test thật với Postgres (login, 401/403, soft delete, audit).
- **Còn nợ:** chưa có e2e tự động (§6).

### M2 Google Drive + Media upload (Plan 03) — ✅ 2026-07-23

- **Phạm vi:** `POST /media/upload` (multipart, validate mime ảnh/video + size),
  `GET/PUT /settings/google-drive`, `POST /settings/google-drive/test` (ADMIN).
  Menu FE mới **"Cài đặt chung"** (`/settings`) để cấu hình Drive không cần sửa `.env`.
- **File chính:** `backend/src/modules/settings/`, `backend/src/modules/media/`,
  `backend/src/infra/drive/` (interface, `GoogleDriveStorage`, `FakeDriveStorage`,
  `DriveStorageFactory`), `backend/src/infra/crypto/crypto.service.ts`,
  `frontend/src/pages/SettingsPage.tsx`
- **Quyết định:** cấu hình Drive chuyển từ hardcode `.env` sang bảng `app_settings`
  (JSONB, secret mã hoá AES-256-GCM), `.env` chỉ còn là fallback bootstrap → ADR-014.
  Thêm permission `settings:manage` (chỉ ADMIN). Phá vòng phụ thuộc
  `SettingsModule ↔ DriveModule` bằng cách tách controller sang
  `SettingsHttpModule` riêng (xem comment trong `settings.module.ts`).
- **Test:** 260 test / 24 suite · coverage service/domain 100% cả 4 chỉ số ·
  đã smoke test thật qua curl (login → GET/PUT settings → upload fake driver →
  test connection → xác nhận đổi `maxUploadMb` có hiệu lực ngay không cần restart →
  CONTENT role gọi `/settings` → 403).
- **Còn nợ:** FE `SettingsPage` vẫn chạy trên state mock cục bộ (chưa có
  `src/api/settings.api.ts`) — nối API thật dời sang M7 (plan 08) theo đúng ADR-005.
  Driver `real` (Google Drive thật) chưa test bằng credential thật, chỉ test bằng
  mock `googleapis`. Tab Facebook/Hệ thống trong "Cài đặt chung" chưa làm.

### M2.5 FE core auth (Plan 03b) — 🟡 2026-07-23

- **Phạm vi:** hạ tầng FE gọi API thật + login thật. `api/client.ts` (fetch wrapper:
  gắn Bearer, refresh token đúng 1 lần khi 401 rồi retry, map lỗi backend → `ApiError`),
  `api/tokenStore.ts` (localStorage), `api/auth.api.ts`. `AuthContext` nối thật khi
  `VITE_USE_MOCK=false` (khôi phục phiên bằng `/auth/me`), `LoginPage` login thật,
  `ProtectedRoute`/`RoleRoute` chặn theo role, Vite proxy `/api`→backend.
- **File chính:** `frontend/src/api/{client,auth.api,tokenStore}.ts`,
  `frontend/src/config/env.ts`, `frontend/src/contexts/AuthContext.tsx`,
  `frontend/src/routes/ProtectedRoute.tsx`, `frontend/src/pages/LoginPage.tsx`
- **Quyết định:** fetch thay axios; tokenStore tách riêng; `useAuthUser()` assert
  non-null cho trang trong vùng auth; vitest config tách file (xung đột type vite 8).
- **Test:** 15 test Vitest xanh (client + permissions). Lint chỉ warning fast-refresh,
  build xanh. **Chưa smoke test với backend thật** (backend chưa chạy lúc code).
- **Còn nợ:** (1) smoke test login/refresh/role guard với backend thật — xem §6.
  (2) Drive upload + SettingsPage nối thật: **hoãn theo yêu cầu user**, để làm sau.

### Drive 2 authMode (Plan 03c) — 🟡 2026-07-24

- **Phạm vi:** cho ADMIN switch chế độ xác thực Drive ở "Cài đặt chung":
  `service_account` (SA JSON + Shared Drive, thêm `supportsAllDrives`) và `oauth2`
  (tài khoản Google, Gmail free). OAuth flow trong app: `GET /settings/google-drive/oauth/url`
  (ADMIN) + `GET .../oauth/callback` (**@Public**, `state` single-use TTL 10') → lưu
  refresh token mã hoá + email. FE SettingsPage: UI 2 mode + nút "Kết nối Google" +
  xử lý `?drive_oauth=success|error`. `POST /media/upload` không đổi — chạy theo config đang lưu.
- **File chính:** `backend/src/modules/settings/{settings.service,drive-oauth.service,
  drive-oauth.controller,settings.controller,settings.types}.ts`,
  `backend/src/infra/drive/{google-drive.storage,drive-storage.factory}.ts`,
  `frontend/src/pages/SettingsPage.tsx`, `frontend/src/api/settings.api.ts`
- **Quyết định:** ADR-016. Config lưu JSONB (không migration). Đổi client id/secret ⇒
  tự xoá refresh token cũ. `mapDriveError` nhận diện lỗi quota qua message (service
  account không ghi được My Drive).
- **Test:** BE 65 test (settings + drive storage/factory oauth) xanh; FE 16 test xanh. lint/build cả hai xanh.
- **Còn nợ:** smoke test OAuth thật (cần OAuth Client của user + đăng ký redirect URI). Chưa `git mv` plan sang DONE.
- **Cập nhật 2026-07-24 (sau):** theo yêu cầu user, **bỏ hẳn driver `fake` khỏi hệ
  thống** (không chỉ ẩn UI) — xem ADR-017. Xoá `DriverMode`, `FakeDriveStorage`,
  `DRIVE_DRIVER`/`FACEBOOK_DRIVER` khỏi env/config/settings/DTO/FE types.
  `assertModeConfigured` giờ luôn validate (không còn early-return khi driver≠real).
  263 test BE xanh, 16 test FE xanh, lint/build cả hai xanh.

### Content Assets giai đoạn 1 (Plan 04) — 🟡 2026-07-24

- **Phạm vi:** CRUD cơ bản cho `content_assets` — tạo content từ file đã upload
  Drive (`POST /content-assets`), list có filter (mediaType/category/search/
  createdBy) + phân trang (`GET /content-assets`), chi tiết, sửa field mô tả
  (`PATCH`), xoá kèm xoá file trên Drive (`DELETE`). **Chưa có** duyệt (status luôn
  `PENDING_REVIEW`), `isAds`, phân bổ page — dời sang giai đoạn 2 (chốt với user).
  RBAC: CONTENT chỉ thao tác bài của chính mình (403 nếu không), EDITOR/ADMIN mọi bài.
- **File chính:** `backend/src/modules/content-assets/` (repository/service/
  controller/dto/mapper), `frontend/src/api/contentAssets.api.ts`,
  `frontend/src/hooks/useContentAssets.ts`, `frontend/src/pages/ContentManagementPage.tsx`
  (tách `RealContentManagementPage` API thật vs `MockContentManagementPage` giữ
  nguyên mock, chọn theo `env.useMock`).
- **Quyết định:** chia 2 giai đoạn theo yêu cầu user 2026-07-24 để đi nhanh — xem
  plan 04 §1. Xoá file Drive khi xoá content (không mồ côi file trên Drive).
- **Test:** BE 11 test mới (RBAC ownership: CONTENT sửa/xoá/xem bài người khác ⇒
  403, scope list theo actor, audit log) — tổng 274 test BE xanh. FE lint/build
  xanh, 16 test Vitest hiện có vẫn xanh (chưa thêm test cho page mới — CRUD thuần
  UI, theo rule 02 không bắt buộc).
- **Còn nợ:** **chưa smoke test tay trên UI thật** — xem §6 mục 7. Giai đoạn 2
  (duyệt/isAds/phân bổ page) chưa làm.

### Facebook Pages + token crypto (Plan 05) — 🟡 2026-07-24

- **Phạm vi:** CRUD `facebook_pages` — `GET /pages` (mọi role, token mask),
  `POST/PUT/DELETE /pages` (ADMIN, `pages:manage`). DELETE = soft delete
  (`isActive=false`, vì `publish_jobs` tham chiếu tới page). `pageId` không sửa
  được sau khi tạo. `getDecryptedToken(id)` — lối vào duy nhất lấy token plaintext,
  chặn page inactive — export sẵn cho publisher (plan 07) dùng sau này.
- **File chính:** `backend/src/modules/facebook-pages/` (repository/service/
  controller/dto/mapper), `backend/src/common/utils/token-mask.util.ts`,
  `frontend/src/api/pages.api.ts`, `frontend/src/hooks/usePages.ts`,
  `frontend/src/pages/PageManagementPage.tsx` (tách `RealPageManagementPage`/
  `MockPageManagementPage` theo `env.useMock`, cùng pattern plan 04).
- **Quyết định:** không tạo `crypto.util.ts` riêng theo plan gốc — tái dùng
  `infra/crypto/crypto.service.ts` (đã có AES-256-GCM từ M2) để tránh trùng lặp,
  chỉ thêm `maskToken` làm util riêng. Mask token tính bằng cách decrypt tại thời
  điểm response (không lưu cột mask riêng trong DB); nếu decrypt lỗi (đổi
  `TOKEN_ENCRYPTION_KEY`) thì trả mask "chưa xác định" thay vì crash cả danh sách
  — đúng rủi ro đã ghi ở plan 05 §6.
- **Test:** BE 286 test (12 test mới `FacebookPagesService`: mask đúng, không lộ
  token trong response/audit log, `getDecryptedToken` chặn page inactive, list vẫn
  chạy khi token cũ không giải mã được, conflict 409 khi trùng `pageId`) — lint +
  build xanh. FE lint + build xanh. Smoke test qua curl với backend thật: tạo/sửa/
  xoá page, mask đúng, EDITOR đọc được nhưng bị 403 khi tạo, log không lộ token.
- **Còn nợ:** **chưa smoke test UI thật qua trình duyệt** — chỉ mới test API qua
  curl. Cần mở `VITE_USE_MOCK=false`, đăng nhập ADMIN, thao tác CRUD trên `/pages`
  thật trước khi coi milestone Done theo rule 00 (`git mv` sang `plans/DONE/` khi
  đó). Xem §6 mục 8.
- **Fix 2026-07-25 — nút Xoá page không có tác dụng:** `remove()` soft delete bằng
  `isActive=false` nhưng `findMany()` không lọc ⇒ page vẫn nằm trong danh sách, chỉ
  đổi cột Active sang "No". Không thể lọc theo `isActive` vì cột đó mang nghĩa
  **tạm dừng** (bật/tắt được trong form Sửa, page tạm dừng vẫn phải hiện). Đã tách
  2 khái niệm: thêm cột `facebook_pages.deleted_at` (migration
  `20260725033247_facebook_pages_deleted_at`, đã cập nhật `erd.md`).
  `remove()` set `deletedAt=now()` + `isActive=false` + `autopostEnabled=false`,
  audit action mới `PAGE_DELETE`. `findMany`/`findById` lọc `deletedAt: null` ⇒ page
  đã xoá coi như không tồn tại (404 khi PUT/DELETE, publisher không lấy được token).
  `create()` với `pageId` đã xoá mềm thì **hồi sinh** dòng cũ thay vì 409 (UNIQUE
  `page_id` áp cả trên dòng đã xoá). 288 test BE xanh (thêm 3), lint/build xanh.
  FE không phải sửa.
- **Bổ sung 2026-07-25 — Test kết nối Page + search danh sách** (yêu cầu user, plan 05 §8):
  thêm `backend/src/infra/facebook/` (adapter Meta Graph đầu tiên: interface,
  `FacebookGraphClient` gọi `GET /{pageId}?fields=id,name,category,tasks` bằng fetch,
  timeout 10s, token đi qua header `Authorization` chứ không qua query; `facebook.errors.ts`
  map code 190/100/200/4 sang message tiếng Việt nói rõ cách sửa). 2 endpoint ADMIN:
  `POST /pages/test-connection` (pageId+token chưa lưu) và `POST /pages/:id/test-connection`
  (dùng token đã lưu — cố ý **không** qua `getDecryptedToken` để page tạm dừng vẫn test được).
  Lỗi Graph ⇒ `200 {ok:false,message}` để form đọc được lý do; `canPost` bật khi `tasks`
  chứa `CREATE_CONTENT` ⇒ phát hiện sớm token đọc được page nhưng không đăng bài được.
  FE: nút "Test kết nối" trong footer popup + `Alert` kết quả, ô search lọc theo tên/Page ID
  (client-side, cả bản Real lẫn Mock). BE 336 test xanh (+18), lint/build 2 phía xanh.
- **Sửa cùng ngày, sau khi gọi Graph thật lần đầu:** bỏ field `tasks` (không tồn tại
  trên page node khi dùng Page token ⇒ Graph trả `(#100)`), thêm `debugToken()` gọi
  **trước** page node để biết token loại gì / của page nào / hạn tới bao giờ ⇒ báo đúng
  "sai Page ID" thay vì "thiếu quyền". Response thêm `tokenType` + `expiresAt`, cảnh báo
  khi token sắp hết hạn. BE 343 test xanh. Chi tiết + bài học: plan 05 §8, §7 cạm bẫy.

### Cài đặt đăng bài tự động — slots CRUD (Plan 06) — 🟡 2026-07-25

- **Phạm vi:** CRUD cấu hình đăng tự động, **không** có logic cron/queue nào.
  `GET /auto-post-configs` (mọi page kèm slot, slot sắp theo giờ tăng dần),
  `PATCH /auto-post-configs/:pageId` (bật/tắt auto — bật khi page chưa có slot thì
  vẫn cho, chỉ trả `warning`), `POST /auto-post-configs/:pageId/slots`,
  `PATCH|DELETE /auto-post-slots/:slotId`. Tất cả gác `autopost:manage`
  (ADMIN + EDITOR; CONTENT ⇒ 403). Trùng `time` trong cùng page ⇒ 409;
  `time` sai định dạng / `categories` rỗng ⇒ 400; `postCount > MAX_POST_PER_SLOT` ⇒ 400.
- **File chính:** `backend/src/modules/auto-post-configs/` (repository/service/
  `auto-post-configs.controller.ts` + `auto-post-slots.controller.ts`/dto/mapper),
  `frontend/src/api/autoPost.api.ts`, `frontend/src/hooks/useAutoPostConfigs.ts`,
  `frontend/src/pages/AutoPostSettingsPage.tsx` (Real/Mock split theo `env.useMock`).
- **Quyết định:** **tách engine đăng tự động ra module riêng** (yêu cầu user
  2026-07-25) — module này chỉ là cấu hình, plan 07 sẽ tạo module engine dùng lại
  `AutoPostConfigsRepository.findDueSlots(hhmm)` (đã export). Audit tách 4 action
  (`AUTOPOST_CONFIG_UPDATE` + `AUTOPOST_SLOT_CREATE/UPDATE/DELETE`) thay vì 1 như plan.
  Response thêm `facebookPageId` + `isActive` ngoài spec để UI cảnh báo page tạm dừng.
  **Không đụng schema** (`auto_post_slots` có từ M0) ⇒ `erd.md` không đổi.
- **Test:** BE 318 test / 28 suite xanh (+32 mới: service 20, repository `findDueSlots`
  2 — lọc đúng slot tắt / page tạm dừng / page tắt auto / page đã xoá, DTO validate 10).
  Lint + build BE/FE xanh, FE 16 test cũ vẫn xanh. Smoke API qua curl với backend thật
  (đủ 4 điều kiện nghiệm thu §5 của plan 06 trừ mục UI), dữ liệu smoke đã dọn khỏi DB dev.
- **Còn nợ:** chưa smoke test tay trên UI thật — xem §6 mục 9.

### Đăng bài thủ công + filter page (Plan 09) — 🟡 2026-07-25

- **Phạm vi:** trang "Cài đặt đăng bài tự động" có thêm filter theo FB Page và nút
  "Đăng bài thủ công" (cả nút "Đăng ngay" trên từng card page). `POST /manual-post`
  (`autopost:manage`) đăng **đồng bộ** 1 bài lên 1 page qua Graph API: chặn page tạm
  dừng (400), bài đã đăng lên chính page đó (409), lỗi Graph/Drive ⇒ job FAILED + 502.
- **File chính:** `backend/src/infra/facebook/facebook-publisher.{interface,client}.ts`,
  `backend/src/modules/manual-post/` (repository/service/controller/dto),
  `frontend/src/api/manualPost.api.ts`, `frontend/src/hooks/useManualPost.ts`,
  `frontend/src/components/autopost/ManualPostModal.tsx`,
  `frontend/src/pages/AutoPostSettingsPage.tsx`
- **Quyết định:** tách hẳn khỏi engine tự động (plan 07) — không cron, không BullMQ,
  user đứng chờ kết quả. Caption/hashtag sửa trong popup chỉ áp cho **lần đăng này**
  (lưu ở `publish_jobs.caption/hashtags`), không ghi đè caption gốc của content.
  `content.status = PUBLISHED` do server set sau khi Graph trả post id — vẫn đúng rule
  "client không được tự set PUBLISHING/PUBLISHED". Video đi qua host `graph-video.facebook.com`.
  File nạp cả vào RAM (đã bị chặn bởi `maxUploadMb` lúc upload Drive).
  Không đụng schema ⇒ `erd.md` không đổi.
- **Test:** BE 357 test / 30 suite xanh (11 test mới `ManualPostService`: chọn đúng
  publishImage/publishVideo theo mediaType, ghép caption+hashtag, 409 trùng, page tạm
  dừng ⇒ 400, lỗi Graph/Drive ⇒ job FAILED và không đụng content/assignment, audit
  MANUAL_PUBLISH). Lint + build BE/FE xanh, FE 16 test cũ vẫn xanh.
- **Còn nợ:** **chưa đăng thật lên Facebook** (thiếu Page token — §6 mục 10); chưa smoke
  UI thật. Video lớn chưa có resumable upload.

---

## 6. Việc đang dở / nợ kỹ thuật

| # | Việc | Chi tiết |
|---|------|----------|
| 1 | **Pino logger + redact secret** ⚠️ TRỄ HẠN | Đã cài `nestjs-pino`, `pino-http`, `pino-pretty` nhưng **vẫn chưa wire** vào `app.module.ts`. Hiện dùng Nest Logger mặc định. Dự định làm ở M1 nhưng chưa làm — mà `POST /auth/login` và `POST /users` đã nhận password rồi. **Rủi ro hiện tại:** chưa có redact tự động; đang an toàn vì không có chỗ nào log body, nhưng phải làm **đầu M2**. Redact bắt buộc: `password`, `token`, `accessToken`, `accessTokenEnc`, `authorization`, `GOOGLE_SERVICE_ACCOUNT_JSON`. |
| 2 | E2E test setup | `test/jest-e2e.json` còn nguyên mặc định, chưa có e2e nào. M1 đã kiểm §5 **bằng tay qua curl** (đạt hết), nhưng chưa tự động hóa. Nên làm cùng M2. |
| 3 | `SettingsPage` (FE) chưa nối API thật | Đang chạy bằng state mock cục bộ trong component, không qua `MockDataContext`/react-query như các trang khác vì chưa tới M7. BE đã có đủ 3 endpoint (`GET/PUT /settings/google-drive`, `POST .../test`) sẵn sàng để nối. |
| 4 | `GoogleDriveStorage` chưa test với credential Google thật ở CI | Chỉ test bằng mock `googleapis` (unit test). Đã xác nhận thủ công 1 lần với service account thật (2026-07-24) rằng service account không có storage quota trên My Drive cá nhân — đúng như `mapDriveError` đã cảnh báo; cần Shared Drive hoặc OAuth2. |
| 5 | **M2.5 chưa smoke test với backend thật** | Code + 15 test Vitest xanh nhưng chưa chạy end-to-end với API. Cần: `docker compose up` + `cd backend && npm run start:dev`, rồi `cd frontend` (đảm bảo `.env` có `VITE_USE_MOCK=false`) `npm run dev` → login admin seed, kiểm token lưu localStorage, đổi role CONTENT bị chặn `/users`, `/pages`, `/settings`. |
| 6 | ~~Drive FE đã nối xong~~ ✅ ĐÃ XONG 2026-07-24 | `api/media.api.ts` + `api/settings.api.ts` + SettingsPage 2 chế độ. **OAuth2 đã smoke test thật thành công** (connect tài khoản Gmail qua UI, redirect URI `http://localhost:3001/api/settings/google-drive/oauth/callback` — cổng đổi 3100→3001 để khớp OAuth Client đã đăng ký). Service_account chỉ chạy được với Shared Drive (Workspace), chưa test lại với authMode này sau đổi cổng (không ảnh hưởng vì không phụ thuộc redirect URI). |
| 7 | **Content Assets giai đoạn 1 chưa smoke test UI thật** | Code BE+FE xong (274 test BE, lint/build 2 phía xanh) nhưng **chưa test tay** — process backend dev hiện tại (`node dist/main`) là build cũ từ trước khi thêm module `content-assets`, cần `npm run start:dev` lại (hoặc restart) để nạp route mới. Sau khi restart: test trên `/content` — upload ảnh/video thật, sửa, xoá (kiểm file trên Drive cũng bị xoá), CONTENT không thấy/sửa được bài người khác. |
| 8 | **Facebook Pages chưa smoke test UI thật** | Code BE+FE xong (286 test BE, lint/build 2 phía xanh), đã smoke test API qua curl (tạo/sửa/xoá page, mask đúng, 409 trùng pageId, EDITOR bị 403) nhưng **chưa test tay trên UI thật**. Cần `VITE_USE_MOCK=false`, đăng nhập ADMIN, vào `/pages` — thêm/sửa/xoá page qua form, kiểm token hiện dạng mask trong bảng, đăng nhập EDITOR kiểm không thấy nút sửa/xoá. |
| 9 | **Auto-post configs chưa smoke test UI thật** | Code BE+FE xong (318 test BE, lint/build 2 phía xanh), đã smoke API qua curl đủ các case nghiệm thu (3 slot sắp theo giờ, trùng giờ ⇒ 409, `time='25:00'` ⇒ 400, `postCount=21` ⇒ 400, warning khi bật auto lúc chưa có slot, CONTENT ⇒ 403) nhưng **chưa test tay trên UI**. Cần `VITE_USE_MOCK=false`, đăng nhập ADMIN, vào `/auto-post` — thêm 3 mốc giờ, kiểm sắp xếp, thêm trùng giờ xem báo lỗi 409, bật/tắt switch Auto ON, xoá mốc giờ. Đăng nhập CONTENT kiểm không vào được trang. |
| 11 | **Đăng bài thủ công chưa chạy thật** | Code BE+FE xong (plan 09, BE 357 test xanh) nhưng đường publish **chưa từng gọi Graph thật** — chặn bởi mục 10 (chưa có Page token). Khi có token: vào `/auto-post` → "Đăng bài thủ công" → chọn 1 **ảnh** trước (nhẹ, nhanh) → kiểm bài lên Page thật, `publish_jobs` SUCCESS + `facebookPostId`, assignment có `published_at`, content chuyển `PUBLISHED`; đăng lại chính bài đó ⇒ 409. Sau đó thử 1 video (đường `graph-video`, timeout 180s). |
| 10 | **Chưa có Page token dùng được cho Page thật** | Đã gọi Graph thật 2026-07-25 và sửa xong adapter (xem §7). Token hiện lưu là **SYSTEM_USER token** (hết hạn 23/09/2026) nhưng system user `toolfbtest` **chưa được gán Page nào** (`/me/accounts` rỗng) nên vẫn không đọc được page. Bước còn lại: Business settings → System users → Add assets → Pages → gán page + task Manage Page, rồi đổi sang Page token qua `/me/accounts`. Token cũ hơn là USER token ngắn hạn (hết hạn trong ngày) nên nút Test vẫn báo đỏ đúng nghiệp vụ. Cần token **System User** (`expires_at = 0`) → dùng nó gọi `/me/accounts` lấy Page token vĩnh viễn → dán vào form. Publisher (plan 07) sẽ chết vì token hết hạn nếu bỏ qua bước này. Business đang dùng: `27820019340966159`, app `KakuCoach`, page thật `111367907895365` (Cửa hàng cây cảnh mini). |

---

## 7. Cạm bẫy đã gặp

> Ghi lại lỗi mất thời gian để session sau không lặp lại.

| Vấn đề | Nguyên nhân & cách xử lý |
|--------|--------------------------|
| FE `vite.config.ts` không nhận key `test` của vitest (TS2769) và xung đột type `Plugin` | Vite 8 dùng rolldown, còn vitest kéo theo bản vite riêng ⇒ hai kiểu `Plugin` khác nhau. Xử lý: **tách cấu hình test ra `vitest.config.ts` riêng** (`defineConfig` từ `vitest/config`), giữ `vite.config.ts` dùng `defineConfig` của `vite`; script test trỏ `--config vitest.config.ts`. |
| Test FE `localStorage.clear is not a function` | jsdom trong môi trường này cấp `localStorage` thiếu method. Xử lý: stub `MemoryStorage` trong `src/test/setup.ts` gán vào `globalThis.localStorage`. |
| `prisma migrate` báo `P1012: datasource url no longer supported` | **Prisma 7** bỏ `url` trong `schema.prisma`. Phải khai ở `prisma.config.ts` (`defineConfig({ datasource: { url: env('DATABASE_URL') } })`) và runtime client dùng `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })`. Cũng bỏ luôn flag `--skip-generate`. |
| Branch coverage kẹt ở 92%, không phủ nổi dòng `constructor(...)` | TypeScript sinh helper `__metadata("design:paramtypes", ...)` chứa ternary không thể chạm tới từ test. Xử lý: `tsconfig.spec.json` đặt `emitDecoratorMetadata: false` **chỉ cho jest**; build thật vẫn giữ để Nest DI hoạt động. |
| `prisma.service.ts` biến mất khỏi báo cáo coverage | Ignore pattern `'/prisma/'` (định loại thư mục `prisma/` gốc) nuốt luôn `src/infra/prisma/`. Phải dùng `'<rootDir>/prisma/'`. **Bài học: pattern coverage phải neo gốc, nếu không sẽ âm thầm miễn trừ code nghiệp vụ.** |
| `npm run start:prod` báo không tìm thấy `dist/main` | `include` trong `tsconfig.json` có `prisma/` nên rootDir bị đẩy lên, ra `dist/src/main.js`. Xử lý: `tsconfig.build.json` khai `include: ["src/**/*"]`. |
| Lỗi TS1272 khi build | Type dùng trong signature của method có decorator phải `import type` riêng (do `isolatedModules` + `emitDecoratorMetadata`). |
| Port 5432/6379/3000 đã bị chiếm | Máy dev có sẵn Postgres, Redis, app khác. Dự án dùng **55432 / 56379 / 3100**. |
| `jwtService.signAsync` báo TS2769 khi truyền `expiresIn: '15m'` | `@nestjs/jwt` v11 nhận `expiresIn` kiểu template `StringValue` của thư viện `ms`, không nhận `string` thường. Xử lý: quy đổi sang **số giây** bằng `common/utils/duration.ts` rồi truyền number. Tiện thể tái dùng luôn cho field `expiresIn` trong response login. |
| Đăng ký guard global làm health check thành 401 | `APP_GUARD` áp cho **mọi** route, kể cả `/api/health` vốn phải public cho Docker healthcheck. Xử lý: `@Public()` decorator + gắn lên `HealthController`. **Nhớ: mỗi lần thêm route công khai mới phải gắn `@Public()`.** |
| `SettingsModule` cần `DriveStorageFactory` (nút "Test kết nối") nhưng `DriveModule` lại import `SettingsModule` (đọc config) ⇒ vòng phụ thuộc NestJS | Tách `SettingsController` ra khỏi `SettingsModule` sang module riêng `SettingsHttpModule` (import cả `SettingsModule` lẫn `MediaModule`). `SettingsModule` chỉ export service, không khai controller. **Bài học: khi 2 module cần lẫn nhau vì 1 phía chỉ cần đọc còn phía kia chỉ cần route, tách controller ra module riêng thay vì cố gộp.** |
| Nút "Xoá" ở `/pages` bấm xong không thấy gì thay đổi | Soft delete dùng chung cột `is_active` với chức năng "tạm dừng", mà list không lọc. **Bài học: soft delete phải có cột dấu xoá riêng (`deleted_at`), không mượn cờ trạng thái nghiệp vụ** — và phải lọc ngay ở repository, không để service/UI tự lọc. |
| `nest build` báo `Property 'deletedAt' does not exist` sau khi sửa schema | Prisma Client sinh ra `backend/generated/prisma` (ADR-010) nên `prisma migrate dev` **không** tự cập nhật type cho tsc trong mọi trường hợp — chạy `npm run prisma:generate` sau khi đổi schema. Lưu ý jest vẫn xanh trong khi tsc đỏ, dễ tưởng là ổn. |
| Nút Test kết nối FB báo "thiếu quyền" trong khi quyền đã đủ | Hai lỗi chồng nhau, mất >1h mới ra: (1) code hỏi `fields=...,tasks` nhưng `tasks` **không tồn tại** trên page node với Page token (chỉ có ở `/me/accounts`) ⇒ Graph trả `(#100)`; (2) Page token của page A đọc page B ⇒ Graph trả `(#10)` = "thiếu quyền", đánh lạc hướng khỏi lỗi thật là **sai Page ID**. Xử lý: gọi `/debug_token` **trước** để biết token loại gì, của page nào, hạn bao lâu — rồi mới gọi page node. **Bài học: adapter external API phải gọi thật ít nhất 1 lần trước khi coi là xong; unit test mock `fetch` chỉ chứng minh code khớp *giả định của mình* về API.** |
| Coverage kẹt vì `jest.Mock` không generic khiến biểu thức trong `expect(...).toEqual({ message: expect.stringContaining(...) })` bị coi là `any` (`no-unsafe-assignment`) | ESLint `recommendedTypeChecked` bắt lỗi này ngay cả trong test. Xử lý: tách thành nhiều `expect(...).toBe(...)`/`toContain(...)` riêng lẻ thay vì gộp vào object literal cho `toEqual`. |
