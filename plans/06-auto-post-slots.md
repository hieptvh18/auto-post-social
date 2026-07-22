# Plan 06 — Cài đặt đăng bài tự động (slots)

**Milestone:** M5
**Trạng thái:** ⬜
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

- [ ] DTO create/update slot + validate như trên
- [ ] Repository: `findAllWithSlots`, `findByPage`, CRUD slot, `findDueSlots(hhmm)`
      (dùng ở Plan 07: slot `enabled` + page `isActive` + `autopostEnabled`)
- [ ] Service: chặn trùng `time`/page, kiểm tra page tồn tại
- [ ] Bật `autopostEnabled` khi page chưa có slot nào ⇒ trả cảnh báo (không chặn)
- [ ] Audit `AUTOPOST_CONFIG_UPDATE`
- [ ] Env `MAX_POST_PER_SLOT` → `.env` + `.env.example`
- [ ] Unit test 100%: time sai định dạng, categories rỗng, postCount ngoài khoảng,
      trùng time ⇒ 409, page không tồn tại ⇒ 404, `findDueSlots` lọc đúng
      (slot disabled / page inactive / autopost off đều bị loại)
- [ ] `npm run lint && npm run test:cov && npm run build` xanh
- [ ] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [ ] Tạo page + 3 slot (08:00, 12:00, 20:00) → `GET /auto-post-configs` trả đúng, sắp theo giờ
- [ ] Thêm slot trùng 08:00 cùng page ⇒ 409
- [ ] `time = '25:00'` ⇒ 400
- [ ] CONTENT gọi bất kỳ endpoint nào ở đây ⇒ 403

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Nhầm lẫn timezone giữa slot và server | Slot là **chuỗi giờ địa phương**, không phải timestamp — ghi rõ comment trong entity |
| Xóa slot khi job đang chạy | Job đã tạo độc lập với slot; xóa slot chỉ ngừng tạo job mới |

---

## 7. Kết quả (điền khi xong)

- **Ngày xong:**
- **File chính:**
- **Khác thiết kế ban đầu:**
- **Test:**
- **Còn nợ:**
