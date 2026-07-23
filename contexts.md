# contexts.md — Trạng thái dự án Tool Auto FB

> **File này là bộ nhớ dài hạn của dự án.**
> Claude PHẢI đọc file này đầu mỗi session và cập nhật nó mỗi khi hoàn thành 1 module
> hoặc kết thúc session. Xem quy tắc cập nhật ở [.claude/rules/03-context-protocol.md](.claude/rules/03-context-protocol.md).

**Cập nhật lần cuối:** 2026-07-23
**Session gần nhất:** M2.5 — FE core auth: dựng `api/client.ts` (Bearer + refresh 1 lần + map lỗi), `AuthContext` nối API thật (flag `VITE_USE_MOCK`), `LoginPage` login thật, route guard theo role, Vite proxy. 15 test Vitest xanh, lint/build xanh. **Chưa smoke test backend thật** (backend chưa lên). Phần Drive upload **hoãn** theo yêu cầu user.

---

## 1. Ảnh chụp hiện trạng

| Thành phần | Trạng thái | Ghi chú |
|-----------|-----------|---------|
| `docs/` | ✅ Hoàn thiện | Spec v3.0, không sửa khi code |
| `.claude/rules/` | ✅ Hoàn thiện | 6 rule: workflow, coding, testing, context, env, ERD |
| `plans/` | ✅ Hoàn thiện | 8 file plan feature + `_TEMPLATE.md` |
| `erd.md` | ✅ Thiết kế xong | Mermaid; **bắt buộc cập nhật khi đổi schema** |
| `frontend/` | 🟡 UI mock + auth thật | 10 page mock; **auth/login đã nối API thật** (M2.5): `api/client.ts`, `AuthContext`, route guard, cờ `VITE_USE_MOCK`. Các trang nghiệp vụ vẫn mock. |
| `backend/` | 🟡 Đang xây | Khung + **auth/RBAC/users** + **settings/media (Drive)** xong. Còn content, pages, auto-post |
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
| ADR-003 | Google Drive & Meta Graph bọc sau interface + có driver `fake` bật bằng env | Chạy/test local không cần credential thật |
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
| ADR-015 | **BE + API song song:** từ M3, mỗi milestone backend tự nối luôn FE trang tương ứng (bỏ mock cho trang đó) thay vì dồn nối API về cuối. Thêm milestone M2.5 dựng `api/client.ts` + `AuthContext` một lần dùng chung. M7 chỉ còn dọn phần sót + nghiệm thu end-to-end | Yêu cầu user 2026-07-23: xong milestone nào phải test tay được trên UI thật ngay, không chỉ curl/Swagger |

---

## 4. Tiến độ theo milestone

Xem kế hoạch chi tiết: [PLAN-MVP.md](./PLAN-MVP.md)

| Milestone | Trạng thái | Ngày xong |
|-----------|-----------|-----------|
| M0 — Scaffold + Docker + Prisma | ✅ | 2026-07-22 |
| M1 — Auth + RBAC + Users | ✅ | 2026-07-22 |
| M2 — Google Drive + Media upload | ✅ | 2026-07-23 |
| M2.5 — FE core (api client + AuthContext + Login) | 🟡 | code+test xong 2026-07-23, chờ smoke test BE thật |
| M3 — Content Assets + assignments (+ nối FE ContentPage) | ⬜ | |
| M4 — Facebook Pages + token crypto (+ nối FE PagePage) | ⬜ | |
| M5 — Auto-post slots CRUD (+ nối FE AutoPostPage) | ⬜ | |
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

---

## 6. Việc đang dở / nợ kỹ thuật

| # | Việc | Chi tiết |
|---|------|----------|
| 1 | **Pino logger + redact secret** ⚠️ TRỄ HẠN | Đã cài `nestjs-pino`, `pino-http`, `pino-pretty` nhưng **vẫn chưa wire** vào `app.module.ts`. Hiện dùng Nest Logger mặc định. Dự định làm ở M1 nhưng chưa làm — mà `POST /auth/login` và `POST /users` đã nhận password rồi. **Rủi ro hiện tại:** chưa có redact tự động; đang an toàn vì không có chỗ nào log body, nhưng phải làm **đầu M2**. Redact bắt buộc: `password`, `token`, `accessToken`, `accessTokenEnc`, `authorization`, `GOOGLE_SERVICE_ACCOUNT_JSON`. |
| 2 | E2E test setup | `test/jest-e2e.json` còn nguyên mặc định, chưa có e2e nào. M1 đã kiểm §5 **bằng tay qua curl** (đạt hết), nhưng chưa tự động hóa. Nên làm cùng M2. |
| 3 | `SettingsPage` (FE) chưa nối API thật | Đang chạy bằng state mock cục bộ trong component, không qua `MockDataContext`/react-query như các trang khác vì chưa tới M7. BE đã có đủ 3 endpoint (`GET/PUT /settings/google-drive`, `POST .../test`) sẵn sàng để nối. |
| 4 | Driver Drive `real` chưa test với credential Google thật | `GoogleDriveStorage` chỉ test bằng mock `googleapis` (unit test). Cần 1 lần chạy tay với service account thật trước khi go-live driver real. |
| 5 | **M2.5 chưa smoke test với backend thật** | Code + 15 test Vitest xanh nhưng chưa chạy end-to-end với API. Cần: `docker compose up` + `cd backend && npm run start:dev`, rồi `cd frontend` (đảm bảo `.env` có `VITE_USE_MOCK=false`) `npm run dev` → login admin seed, kiểm token lưu localStorage, đổi role CONTENT bị chặn `/users`, `/pages`, `/settings`. |
| 6 | **Drive upload FE hoãn** | `POST /media/upload` + `SettingsPage` (3 endpoint Drive) đã có BE sẵn nhưng FE **hoãn nối theo yêu cầu user** (ưu tiên login trước). Khi làm: tạo `api/media.api.ts` + `api/settings.api.ts`, bỏ mock cho ContentManagementPage (phần upload) và SettingsPage. Thay cho debt #3. |

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
| Coverage kẹt vì `jest.Mock` không generic khiến biểu thức trong `expect(...).toEqual({ message: expect.stringContaining(...) })` bị coi là `any` (`no-unsafe-assignment`) | ESLint `recommendedTypeChecked` bắt lỗi này ngay cả trong test. Xử lý: tách thành nhiều `expect(...).toBe(...)`/`toContain(...)` riêng lẻ thay vì gộp vào object literal cho `toEqual`. |
