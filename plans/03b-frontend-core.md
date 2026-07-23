# Plan 03b — Frontend core: api client + AuthContext + Login thật

**Milestone:** M2.5
**Trạng thái:** 🟡 (code + test xong, chờ smoke test với backend chạy thật)
**Phụ thuộc:** Plan 02 (auth thật ở backend)
**Spec:** `docs/04-api-spec.md` §1 (auth), `docs/05-rbac.md` §7

---

## 1. Mục tiêu

Dựng hạ tầng gọi API thật ở frontend **một lần**, dùng chung cho mọi milestone sau
(M3–M7): fetch wrapper có gắn token + refresh, `AuthContext` thật, route guard theo
role, cờ `VITE_USE_MOCK` để tắt/bật. Sau plan này, `LoginPage` đăng nhập được bằng
admin seed thật — mọi trang khác **vẫn giữ mock** cho tới khi milestone của nó tới
lượt nối (M3 nối Content, M4 nối Pages, ...).

Tách plan này ra riêng (thay vì gộp vào M7 cuối cùng) để M3–M6 có sẵn hạ tầng mà
nối API ngay khi backend xong, thay vì phải chờ tới cuối mới test được trên UI thật.

## 2. Ngoài phạm vi

Nối API cho ContentManagement/PageManagement/AutoPostSettings/Timeline — việc đó
nằm trong plan của từng milestone tương ứng (04, 05, 06, 07). Plan này **chỉ** làm
phần dùng chung + Login.

## 3. Thiết kế

```text
frontend/src/
├── config/env.ts                  # đọc import.meta.env, export object đã type
├── api/client.ts                  # fetch wrapper: baseURL, gắn Bearer, refresh khi 401, map lỗi
├── api/auth.api.ts                # login, refresh, me
├── hooks/useAuth.ts                # React Query wrapper quanh AuthContext
└── contexts/AuthContext.tsx       # lưu token (localStorage), user hiện tại, logout
```

Cờ `VITE_USE_MOCK=true` ⇒ `client.ts` không gọi backend, trả qua `MockDataContext`
như hiện tại; `false` ⇒ gọi backend thật qua `VITE_API_BASE_URL`. Component không
biết đang ở chế độ nào — mọi page khác (Content, Pages, AutoPost, Timeline...) vẫn
đọc từ `MockDataContext` ở plan này, chỉ `AuthContext`/`LoginPage` là ngoại lệ đổi
sang thật ngay.

`api/client.ts` là **nơi duy nhất** các `api/<feature>.api.ts` sau này (plan 04+)
sẽ import — chúng chỉ cần thêm hàm gọi endpoint, không tự viết lại fetch/refresh.

## 4. Task

- [x] `frontend/.env` + `.env.example`: `VITE_API_BASE_URL`, `VITE_USE_MOCK`
- [x] `src/config/env.ts` — nơi duy nhất chạm `import.meta.env`
- [x] `api/client.ts`: gắn token, tự refresh khi 401 (retry đúng 1 lần, dùng chung
      1 promise khi nhiều request 401 song song), hết hạn ⇒ dọn token + `onAuthExpired`,
      map lỗi backend thành `ApiError` (statusCode + messages)
- [x] `api/tokenStore.ts` (localStorage) + `api/auth.api.ts`: `login`, `me`
      (refresh gọi nội bộ trong client)
- [x] `AuthContext` dùng API thật khi `VITE_USE_MOCK=false`, khôi phục phiên bằng
      `/auth/me`, cung cấp `user`, `login()`, `logout()`, `switchPreviewRole()` (mock);
      thêm hook `useAuthUser()` cho các trang trong vùng đã xác thực
- [x] Route guard: `ProtectedRoute` (loading + chặn chưa auth) + `RoleRoute` +
      `canAccessRoute` theo ma trận `docs/05` §7 (ẩn menu + chặn gõ thẳng URL)
- [x] `LoginPage` gọi `login()` thật (bỏ Select role mock), hiện lỗi 401 rõ ràng
- [x] `permissions.ts`: bổ sung `settings:manage` (thiếu từ M2)
- [x] Vite dev proxy `/api` → backend (port 3100)
- [x] Test Vitest: `api/client` (gắn token, skipAuth, map lỗi + message mảng, refresh
      đúng 1 lần rồi retry, refresh fail ⇒ dọn token + onAuthExpired, 204) + `permissions`
      → **15 test xanh**
- [x] `npm run lint` (chỉ warning fast-refresh) & `npm run build` (frontend) xanh
- [ ] Smoke test với backend chạy thật (login admin seed, refresh, role guard) — **chưa
      chạy, backend chưa lên** (xem điều kiện nghiệm thu)
- [ ] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [ ] `VITE_USE_MOCK=false` + backend chạy: login admin seed vào được, `AuthContext`
      có đúng `user`/`role`
- [ ] Sai mật khẩu ⇒ hiện lỗi, không crash
- [ ] Token hết hạn (giả lập 401) ⇒ tự refresh 1 lần; refresh cũng fail ⇒ logout về `/login`
- [ ] Đăng nhập bằng CONTENT: menu Timeline/Auto-Post/Pages/Users không hiện, gõ
      thẳng URL bị chặn
- [ ] `VITE_USE_MOCK=true` ⇒ toàn app (kể cả Login) vẫn chạy bằng mock như trước,
      không cần backend

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Refresh token gây vòng lặp 401 | Chỉ retry **một** lần, thất bại thì logout ngay |
| Các trang khác lỡ tay đổi sang gọi API thật trước milestone của nó | Review diff: M2.5 chỉ động vào `AuthContext`/`LoginPage`/`api/client.ts`, không sửa page khác |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:** 2026-07-23 (code + test; chờ smoke test backend thật)
- **File chính:** `frontend/src/api/{client,auth.api,tokenStore}.ts`,
  `frontend/src/config/env.ts`, `frontend/src/contexts/AuthContext.tsx`,
  `frontend/src/routes/ProtectedRoute.tsx`, `frontend/src/pages/LoginPage.tsx`,
  `frontend/vite.config.ts` (proxy), `frontend/vitest.config.ts`,
  `frontend/src/api/__tests__/client.test.ts`, `frontend/src/utils/__tests__/permissions.test.ts`
- **Khác thiết kế ban đầu:**
  1. Dùng **fetch** thay axios (không thêm runtime dep) — plan vốn ghi "fetch wrapper".
  2. Tách **tokenStore** riêng để client + AuthContext dùng chung nguồn token.
  3. Thêm `useAuthUser()` (assert non-null) cho trang trong ProtectedRoute, tránh
     rải `user?.` khắp nơi khi `user` giờ có thể null ở chế độ thật.
  4. Preview mode giữ nguyên: `switchPreviewRole()` thay cho việc login lại bằng role.
  5. **vitest config tách file riêng** (`vitest.config.ts`) vì vite 8 (rolldown) và
     bản vite vitest kéo theo xung đột type nếu nhét `test` vào `vite.config.ts`.
- **Test:** 15 test Vitest xanh (8 client + 7 permissions). Lint chỉ còn warning
  fast-refresh (chấp nhận — hook export cạnh provider). Build xanh.
- **Còn nợ:**
  1. **Smoke test với backend thật** chưa chạy (backend chưa lên lúc code). Cần chạy:
     `docker compose up` + `cd backend && npm run start:dev`, rồi FE `VITE_USE_MOCK=false`
     `npm run dev` → login admin seed, thử role CONTENT bị chặn `/users`, để token hết
     hạn xem refresh.
  2. **Nối `POST /media/upload` + SettingsPage Drive** đã **hoãn theo yêu cầu user**
     (làm sau) — thuộc M3/M7, không nằm trong M2.5.
