# PLAN MVP — Tool Auto FB

> Bản đồ tổng. Chi tiết từng feature nằm trong `plans/NN-*.md`.
> Trạng thái thực tế luôn đọc ở [contexts.md](./contexts.md).

**Chốt ngày:** 2026-07-22

---

## 1. Luồng MVP phải chạy được

```text
[1] Upload video/ảnh  ──▶ Google Drive (folder cấu hình sẵn), DB lưu metadata
[2] Quản lý FB Page   ──▶ CRUD page + access token (encrypted)
[3] Cài đặt đăng tự động ▶ mỗi page: các mốc giờ + category + media type + số bài
[4] Cron mỗi phút     ──▶ tới mốc giờ, lấy bài APPROVED đúng category/media,
                          chưa đăng ở page đó, cũ nhất trước
[5] BullMQ worker     ──▶ stream file từ Drive → Meta Graph API → post lên Page
[6] Cập nhật kết quả  ──▶ assignment.published_at + content → PUBLISHED
```

Tiêu chí nghiệm thu MVP: tạo 1 page + 1 slot, upload 3 video, duyệt, tới giờ slot
Bot tự đăng đúng số bài, đúng thứ tự, không đăng lặp — quan sát được trên UI Timeline.

---

## 2. Milestone & file plan

| M | Feature | Plan | Phụ thuộc |
|---|---------|------|-----------|
| M0 | Scaffold backend, Docker, Prisma, env | [plans/01-scaffold.md](./plans/01-scaffold.md) | — |
| M1 | Auth JWT + RBAC + Users | [plans/02-auth-rbac-users.md](./plans/02-auth-rbac-users.md) | M0 |
| M2 | Google Drive + upload media | [plans/03-google-drive-upload.md](./plans/03-google-drive-upload.md) | M0 |
| M3 | Content assets + duyệt + phân bổ page | [plans/04-content-assets.md](./plans/04-content-assets.md) | M1, M2 |
| M4 | Facebook Pages + mã hóa token | [plans/05-facebook-pages.md](./plans/05-facebook-pages.md) | M1 |
| M5 | Cài đặt đăng bài tự động (slots) | [plans/06-auto-post-slots.md](./plans/06-auto-post-slots.md) | M4 |
| M6 | Cron picker + BullMQ + publisher | [plans/07-autopost-engine.md](./plans/07-autopost-engine.md) | M3, M5 |
| M7 | Frontend nối API thật | [plans/08-frontend-integration.md](./plans/08-frontend-integration.md) | M1–M6 |

Thứ tự bắt buộc: M0 → M1 → (M2 ∥ M4) → M3 → M5 → **M6** → M7.
M6 là tim của sản phẩm — mọi milestone trước tồn tại để phục vụ nó.

---

## 3. Ngoài phạm vi MVP

Dashboard aggregation nâng cao · Queue Monitor UI · Failed Jobs UI · Audit Logs UI ·
Reconciliation cron · Nginx/production compose · retry/cancel job qua UI ·
Instagram/TikTok · AI caption.

Backend **vẫn ghi** audit log (rẻ, và cron cần dấu vết), chỉ chưa làm màn hình.

---

## 4. Rủi ro chính

| Rủi ro | Xử lý |
|--------|-------|
| Không có credential Drive/Meta khi dev | Driver `fake` bật bằng env (ADR-003) |
| Cron chạy 2 lần khi restart | Bảng `slot_runs` UNIQUE(slot_id, run_date, run_time) (ADR-006) |
| Video lớn gây OOM | Chỉ stream, không ghi file xuống disk |
| Picker logic sai ⇒ đăng lặp/thiếu | Test bắt buộc theo `.claude/rules/02-testing.md` §Bắt buộc phải phủ |
| Token FB hết hạn | Lưu `token_expire_at`, job FAILED kèm message rõ |

---

## 5. Định nghĩa Done của MVP

- [ ] `docker compose up` + `npm run start:dev` chạy được toàn bộ stack local
- [ ] Login bằng admin seed
- [ ] Upload video → thấy file trên Drive (hoặc fake driver) → content `PENDING_REVIEW`
- [ ] EDITOR duyệt → `APPROVED`
- [ ] Tạo page + slot → tới giờ Bot tạo job và đăng
- [ ] Content → `PUBLISHED`, assignment có `facebook_post_id`
- [ ] Đăng lại lần 2 cùng page: **không** xảy ra
- [ ] Coverage service/domain 100%, lint + build xanh
- [ ] `contexts.md` phản ánh đúng hiện trạng
