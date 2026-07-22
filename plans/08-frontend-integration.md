# Plan 08 — Frontend nối API thật

**Milestone:** M7
**Trạng thái:** ⬜
**Phụ thuộc:** Plan 02–07
**Spec:** `docs/04-api-spec.md`, `docs/05-rbac.md` §7

---

## 1. Mục tiêu

Thay mock data bằng API thật cho các màn hình thuộc luồng MVP, giữ mock sau cờ
`VITE_USE_MOCK` để demo/offline vẫn chạy.

## 2. Ngoài phạm vi

Queue Monitor, Failed Jobs, Audit Logs, Dashboard nâng cao — giữ nguyên mock ở MVP.
Không đại tu UI hiện có.

## 3. Thiết kế

```text
frontend/src/
├── config/env.ts                  # đọc import.meta.env, export object đã type
├── api/client.ts                  # fetch wrapper: baseURL, gắn Bearer, refresh khi 401, map lỗi
├── api/<feature>.api.ts           # auth, users, pages, media, contentAssets, autoPost, publishJobs
├── hooks/use<Feature>.ts          # React Query: query key, mutation + invalidate
└── contexts/AuthContext.tsx       # lưu token (localStorage), user hiện tại, logout
```

Cờ `VITE_USE_MOCK=true` ⇒ api layer trả dữ liệu từ `MockDataContext`; `false` ⇒ gọi
backend. Component **không** biết đang ở chế độ nào.

Màn hình nối thật (đúng thứ tự): Login → PageManagement → AutoPostSettings →
ContentManagement (bao gồm upload) → Timeline.

## 4. Task

- [ ] `frontend/.env` + `.env.example`: `VITE_API_BASE_URL`, `VITE_USE_MOCK`
- [ ] `src/config/env.ts` — nơi duy nhất chạm `import.meta.env`
- [ ] `api/client.ts`: gắn token, tự refresh khi 401, hết hạn ⇒ logout + về `/login`
- [ ] `AuthContext` dùng API thật, lưu/khôi phục token, chặn route theo role (`docs/05` §7)
- [ ] Vite dev proxy `/api` → backend (tránh CORS khi dev)
- [ ] `useAuth`, `usePages`, `useAutoPostConfigs`, `useContentAssets`, `useTimeline`
- [ ] `ContentManagementPage`: upload multipart (kèm progress) → `POST /content-assets`;
      drawer edit gọi `PATCH`; filter đẩy lên query param của server
- [ ] Hiển thị lỗi backend đúng ngữ cảnh (403/409/422) bằng `message`/`Alert`
- [ ] Mọi mutation `invalidateQueries` đúng key
- [ ] Test Vitest cho `utils/permissions` và `api/client` (gắn token, xử lý 401)
- [ ] `npm run lint && npm run build` (frontend) xanh
- [ ] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [ ] `VITE_USE_MOCK=false` + backend chạy: login admin seed vào được hệ thống
- [ ] Tạo page → tạo slot → upload video → duyệt → tới giờ thấy bài trong Timeline
- [ ] Đăng nhập bằng user CONTENT: menu Timeline/Auto-Post/Pages/Users **không hiện**,
      gõ thẳng URL ⇒ bị chặn
- [ ] `VITE_USE_MOCK=true` ⇒ app vẫn chạy đầy đủ không cần backend

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Type FE lệch response BE | Sinh/đối chiếu type từ Swagger; đặt tại `src/types/` dùng chung |
| Refresh token gây vòng lặp 401 | Chỉ retry **một** lần, thất bại thì logout ngay |
| Upload video lớn timeout | Progress bar + timeout riêng cho endpoint upload |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:**
- **Còn nợ:**
