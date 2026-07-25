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

Từ M3 trở đi, **mỗi milestone backend tự nối luôn phần frontend tương ứng** (API
layer + hook + bỏ mock cho đúng trang đó) — không dồn việc nối API về cuối. Mục
tiêu: xong milestone nào là **test tay được trên UI thật** milestone đó, không
phải chỉ qua curl/Swagger.

| M | Feature | Plan | Phụ thuộc | FE nối kèm |
|---|---------|------|-----------|-----------|
| M0 | Scaffold backend, Docker, Prisma, env | [plans/01-scaffold.md](./plans/01-scaffold.md) | — | — |
| M1 | Auth JWT + RBAC + Users | [plans/02-auth-rbac-users.md](./plans/02-auth-rbac-users.md) | M0 | — |
| M2 | Google Drive + upload media | [plans/DONE/03-google-drive-upload.md](./plans/DONE/03-google-drive-upload.md) | M0 | SettingsPage (còn nợ, xem contexts §6) |
| M2.5 | FE core: api client + AuthContext + Login | [plans/03b-frontend-core.md](./plans/03b-frontend-core.md) | M1 | LoginPage, route guard |
| M3 | Content assets + duyệt + phân bổ page | [plans/04-content-assets.md](./plans/04-content-assets.md) | M1, M2, M2.5 | ContentManagementPage |
| M4 | Facebook Pages + mã hóa token | [plans/05-facebook-pages.md](./plans/05-facebook-pages.md) | M1, M2.5 | PageManagementPage |
| M5 | Cài đặt đăng bài tự động (slots) | [plans/06-auto-post-slots.md](./plans/06-auto-post-slots.md) | M4 | AutoPostSettingsPage |
| M6 | Cron picker + BullMQ + publisher | [plans/07-autopost-engine.md](./plans/07-autopost-engine.md) | M3, M5 | TimelinePage — màn lịch/tracking đã làm trước ở [plans/12-publish-schedule-tracking.md](./plans/12-publish-schedule-tracking.md) |
| M7 | Dọn dẹp FE còn lại + nghiệm thu MVP end-to-end | [plans/08-frontend-integration.md](./plans/08-frontend-integration.md) | M1–M6 | UserManagementPage, phần còn sót |

Thứ tự bắt buộc: M0 → M1 → (M2 ∥ M4) → M2.5 → M3 → M5 → **M6** → M7.
M2.5 chỉ cần chờ M1 (auth) — có thể làm song song với M2/M4 vì không đụng route
nghiệp vụ. M3 và M4 độc lập nhau, có thể làm song song (khác người/khác phiên);
M6 là tim của sản phẩm, phải chờ cả M3 lẫn M5 xong.

Quy tắc cho mỗi milestone M3–M6: **không tick "Done" cho tới khi đã test được
bằng tay trên UI thật** (không phải mock, không chỉ Swagger) theo điều kiện nghiệm
thu trong file plan tương ứng.

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
| Cần credential Drive/Meta thật kể cả khi dev | Không còn driver `fake` (bỏ ADR-003 ⇒ ADR-017) — dev/test dùng credential thật hoặc mock adapter trong unit test |
| Cron chạy 2 lần khi restart | Bảng `slot_runs` UNIQUE(slot_id, run_date, run_time) (ADR-006) |
| Video lớn gây OOM | Chỉ stream, không ghi file xuống disk |
| Picker logic sai ⇒ đăng lặp/thiếu | Test bắt buộc theo `.claude/rules/02-testing.md` §Bắt buộc phải phủ |
| Token FB hết hạn | Lưu `token_expire_at`, job FAILED kèm message rõ |

---

## 5. Định nghĩa Done của MVP

- [ ] `docker compose up` + `npm run start:dev` chạy được toàn bộ stack local
- [ ] Login bằng admin seed
- [ ] Upload video → thấy file trên Drive thật → content `PENDING_REVIEW`
- [ ] EDITOR duyệt → `APPROVED`
- [ ] Tạo page + slot → tới giờ Bot tạo job và đăng
- [ ] Content → `PUBLISHED`, assignment có `facebook_post_id`
- [ ] Đăng lại lần 2 cùng page: **không** xảy ra
- [ ] Logic phức tạp có test (auto-post engine + crypto bắt buộc); lint + build xanh
- [ ] `contexts.md` phản ánh đúng hiện trạng
