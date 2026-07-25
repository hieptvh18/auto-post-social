# Plan 06 — Cài đặt đăng bài tự động (slots)

**Milestone:** M5
**Trạng thái:** 🟡 (code + test + smoke API xong, chờ smoke UI thật)
**Phụ thuộc:** Plan 05
**Spec:** `docs/04-api-spec.md` §6, `docs/03-database-design.md` §3

---

## 1. Mục tiêu

Mỗi FB Page cấu hình được các mốc giờ đăng trong ngày; mỗi mốc chọn category, loại
media và số bài. Config một lần, dùng suốt vòng đời — đây là đầu vào cho cron ở Plan 07.

## 2. Ngoài phạm vi

Lịch theo thứ trong tuần, ngày lễ, khoảng thời gian hiệu lực, template caption theo slot.
MVP: slot lặp lại **mỗi ngày**.

## 3. Thiết kế

**Endpoint** (ADMIN, EDITOR — `autopost:manage`)

| Method | Path | Ghi chú |
|--------|------|---------|
| GET | `/auto-post-configs` | mọi page kèm slots, sắp xếp theo `time` |
| PATCH | `/auto-post-configs/:pageId` | bật/tắt `autopostEnabled` |
| POST | `/auto-post-configs/:pageId/slots` | thêm mốc giờ |
| PATCH | `/auto-post-slots/:slotId` | sửa / bật tắt |
| DELETE | `/auto-post-slots/:slotId` | xóa |

**Validate**

- `time`: regex `^([01]\d|2[0-3]):[0-5]\d$`, hiểu theo `Asia/Ho_Chi_Minh`.
- `categories`: mảng không rỗng.
- `mediaType`: `image` | `video` | `all`.
- `postCount`: số nguyên 1..`MAX_POST_PER_SLOT` (mặc định 20).
- Trùng `time` trong cùng page ⇒ **409** (tránh hai slot cùng bắn một lúc).
- Page không tồn tại / inactive ⇒ 404.

## 4. Task

- [x] DTO create/update slot + validate như trên
- [x] Repository: `findAllWithSlots`, `findByPage`, CRUD slot, `findDueSlots(hhmm)`
      (dùng ở Plan 07: slot `enabled` + page `isActive` + `autopostEnabled`)
- [x] Service: chặn trùng `time`/page, kiểm tra page tồn tại
- [x] Bật `autopostEnabled` khi page chưa có slot nào ⇒ trả cảnh báo (không chặn)
- [x] Audit `AUTOPOST_CONFIG_UPDATE`
- [x] Env `MAX_POST_PER_SLOT` → `.env` + `.env.example`
- [x] Unit test **cho logic lọc/validate quan trọng** (không bắt buộc 100%):
      `findDueSlots` lọc đúng (slot disabled / page inactive / autopost off đều bị
      loại) — đây là đầu vào của cron nên phải chắc; validate time/categories/postCount;
      trùng time ⇒ 409. CRUD thuần không cần test riêng.
- [x] `npm run lint && npm run build` xanh (chạy `npm run test` cho `findDueSlots` + validate)
- [x] Cập nhật `contexts.md`

## 4b. Nối frontend — AutoPostSettingsPage

Làm ngay sau khi backend xanh, test tay trên UI thật. Hạ tầng chung đã có ở Plan 03b.

- [x] `src/api/autoPost.api.ts`: list configs kèm slots, patch config (bật/tắt),
      CRUD slot
- [x] `src/hooks/useAutoPostConfigs.ts`: query key + mutation, `invalidateQueries`
- [x] `AutoPostSettingsPage`: bỏ mock cho trang này khi `VITE_USE_MOCK=false`; form
      thêm/sửa slot (time picker, category, mediaType, postCount); hiện lỗi 409 trùng time
- [x] Type response ở `src/types/`, đối chiếu Swagger
- [x] `npm run lint && npm run build` (frontend) xanh

## 5. Điều kiện nghiệm thu

- [x] Tạo page + 3 slot (08:00, 12:00, 20:00) → `GET /auto-post-configs` trả đúng, sắp theo giờ
- [x] Thêm slot trùng 08:00 cùng page ⇒ 409
- [x] `time = '25:00'` ⇒ 400
- [x] CONTENT gọi bất kỳ endpoint nào ở đây ⇒ 403
- [ ] **Trên UI thật** (`VITE_USE_MOCK=false`): tạo page + 3 slot qua UI → hiện đúng,
      sắp theo giờ; thêm slot trùng giờ báo lỗi — **CHƯA LÀM** (mới smoke qua curl)

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Nhầm lẫn timezone giữa slot và server | Slot là **chuỗi giờ địa phương**, không phải timestamp — ghi rõ comment trong entity |
| Xóa slot khi job đang chạy | Job đã tạo độc lập với slot; xóa slot chỉ ngừng tạo job mới |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:** 2026-07-25 (code + test + smoke API; chờ smoke UI thật)
- **File chính:** `backend/src/modules/auto-post-configs/` (repository/service/
  2 controller/dto/mapper), `frontend/src/api/autoPost.api.ts`,
  `frontend/src/hooks/useAutoPostConfigs.ts`,
  `frontend/src/pages/AutoPostSettingsPage.tsx`
- **Khác thiết kế ban đầu:**
  - Module đặt tên `auto-post-configs` và **chỉ chứa CRUD cấu hình** — engine đăng
    tự động (cron picker + BullMQ + publisher) sẽ là module riêng ở plan 07, dùng lại
    `AutoPostConfigsRepository.findDueSlots` được export sẵn. (Yêu cầu user 2026-07-25:
    tách hẳn phần logic auto đăng bài.)
  - Hai controller trong cùng module (`/auto-post-configs` và `/auto-post-slots`) vì
    docs/04 §6 khai 2 nhóm route nhưng cùng một nghiệp vụ.
  - Audit tách 4 action thay vì 1: `AUTOPOST_CONFIG_UPDATE` (bật/tắt page) +
    `AUTOPOST_SLOT_CREATE/UPDATE/DELETE` — điều tra "ai xoá mốc giờ" cần biết slot nào.
  - `MAX_POST_PER_SLOT` đã có sẵn trong `.env`/`.env.example`/`env.validation.ts` từ M0,
    không phải thêm mới; chỉ dùng ở service (`assertPostCountInRange`).
  - Response config thêm `facebookPageId` (page id phía Meta) và `isActive` ngoài spec —
    UI cần phân biệt page tạm dừng (bật auto vẫn không chạy).
  - Không đụng schema ⇒ `erd.md` không đổi (bảng `auto_post_slots` đã có từ M0).
- **Test:** BE 318 test / 28 suite xanh (+32 test mới: 20 service, 2 repository
  `findDueSlots`, 10 DTO validate). Lint + build BE/FE xanh, FE 16 test cũ vẫn xanh.
  Smoke API qua curl với backend thật: tạo 3 slot sắp đúng theo giờ, trùng giờ ⇒ 409,
  `time='25:00'` ⇒ 400, `postCount=21` ⇒ 400, `categories=[]` ⇒ 400, bật auto khi
  chưa có slot ⇒ trả `warning`, PATCH đổi sang giờ trùng ⇒ 409, DELETE ⇒ 204 rồi 404,
  CONTENT gọi mọi endpoint ⇒ 403. Đã dọn sạch dữ liệu smoke test khỏi DB dev.
- **Còn nợ:** chưa smoke test tay trên UI thật (§5 mục cuối).
