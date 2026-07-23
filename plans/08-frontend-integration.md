# Plan 08 — Dọn dẹp FE còn lại + nghiệm thu MVP end-to-end

**Milestone:** M7
**Trạng thái:** ⬜
**Phụ thuộc:** Plan 03b–07 (mỗi milestone đã tự nối FE trang của nó)
**Spec:** `docs/04-api-spec.md`, `docs/05-rbac.md` §7

---

## 1. Mục tiêu

Tới milestone này, phần lớn frontend đã được nối API thật **rải theo từng milestone**
(Login ở M2.5, Content ở M3, Pages ở M4, AutoPost ở M5, Timeline ở M6). Plan này chỉ
lo **phần còn sót** và **chạy nghiệm thu MVP end-to-end** một lượt.

## 2. Ngoài phạm vi

Queue Monitor, Failed Jobs, Audit Logs, Dashboard nâng cao — giữ nguyên mock ở MVP.
Không đại tu UI hiện có. Không viết lại `api/client.ts`/`AuthContext` (đã xong ở M2.5).

## 3. Việc còn lại

- `UserManagementPage` — nối `GET/POST/PATCH/DELETE /users` (chưa milestone nào nhận).
- `SettingsPage` — nối 3 endpoint Drive (`GET/PUT /settings/google-drive`,
  `POST .../test`) đã sẵn từ M2 nhưng FE còn chạy state mock cục bộ (contexts §6 mục 3).
- Rà lại các trang đã nối: đảm bảo `VITE_USE_MOCK=true` vẫn chạy đủ bằng mock.

## 4. Task

- [ ] `src/api/users.api.ts` + `useUsers` hook → `UserManagementPage` bỏ mock
- [ ] `src/api/settings.api.ts` + hook → `SettingsPage` bỏ state mock cục bộ, dùng API thật
- [ ] Kiểm tra chéo: mọi mutation ở mọi trang đã `invalidateQueries` đúng key
- [ ] `VITE_USE_MOCK=true` toàn app vẫn chạy được không cần backend (demo/offline)
- [ ] `npm run lint && npm run build` (frontend) xanh

## 5. Điều kiện nghiệm thu (chạy end-to-end, driver fake)

- [ ] `VITE_USE_MOCK=false` + backend chạy: login admin seed
- [ ] Tạo page → tạo slot → upload video → duyệt → tới giờ thấy bài trong Timeline
      (toàn bộ qua UI thật, không curl)
- [ ] Đăng lại lần 2 cùng page: **không** xảy ra
- [ ] Đăng nhập bằng CONTENT: menu Timeline/Auto-Post/Pages/Users không hiện, gõ
      thẳng URL bị chặn
- [ ] `VITE_USE_MOCK=true` ⇒ app vẫn chạy đầy đủ không cần backend

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Type FE lệch response BE | Đối chiếu type từ Swagger; đặt tại `src/types/` dùng chung |
| Trang nối rải rác ⇒ mock/thật lệch nhau | Rà một lượt cuối: bật/tắt `VITE_USE_MOCK` chạy thử cả hai chế độ |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:**
- **Còn nợ:**
