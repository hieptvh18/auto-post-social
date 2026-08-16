# PLAN MVP — Tool Auto FB

> Bản đồ tổng. Chi tiết từng feature nằm trong `plans/NN-*.md`.
> Trạng thái thực tế luôn đọc ở [contexts.md](./contexts.md).

**Chốt ngày:** 2026-07-22
**Trạng thái MVP: ✅ ĐÃ ĐÓNG 2026-07-25** — toàn bộ M0→M7 xong, mọi file plan đã
chuyển sang [plans/DONE/](./plans/DONE/). Phần smoke UI/đăng thật lên Page còn lại
là **nợ nghiệm thu**, theo dõi ở `contexts.md` §6 (không mở lại milestone).

**Sau MVP — Phase 2 đang làm:** [M8 Monitor](./plans/13-monitor.md) (Queue Monitor ·
Failed Jobs · Audit Logs) → [M9 Dashboard](./plans/14-dashboard.md) (Tổng quan chạy
số liệu thật — màn cuối cùng còn mock).

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

| M | Feature | Plan | Trạng thái | FE nối kèm |
|---|---------|------|-----------|-----------|
| M0 | Scaffold backend, Docker, Prisma, env | [DONE/01-scaffold.md](./plans/DONE/01-scaffold.md) | ✅ 22/07 | — |
| M1 | Auth JWT + RBAC + Users | [DONE/02-auth-rbac-users.md](./plans/DONE/02-auth-rbac-users.md) | ✅ 22/07 | — |
| M2 | Google Drive + upload media | [DONE/03-google-drive-upload.md](./plans/DONE/03-google-drive-upload.md) · [DONE/03c](./plans/DONE/03c-drive-auth-modes.md) | ✅ 24/07 | SettingsPage (2 authMode) |
| M2.5 | FE core: api client + AuthContext + Login | [DONE/03b-frontend-core.md](./plans/DONE/03b-frontend-core.md) | ✅ 23/07 | LoginPage, route guard |
| M3 | Content assets + duyệt + phân bổ page | [DONE/04](./plans/DONE/04-content-assets.md) · [DONE/11](./plans/DONE/11-content-review-assignment-hashtags.md) | ✅ 25/07 | ContentManagementPage |
| M4 | Facebook Pages + mã hóa token | [DONE/05-facebook-pages.md](./plans/DONE/05-facebook-pages.md) | ✅ 24/07 | PageManagementPage |
| M5 | Cài đặt đăng bài tự động (slots) + đăng tay | [DONE/06](./plans/DONE/06-auto-post-slots.md) · [DONE/09](./plans/DONE/09-manual-post.md) | ✅ 25/07 | AutoPostSettingsPage |
| M6 | Cron picker + BullMQ + publisher + lịch đăng bài | [DONE/07](./plans/DONE/07-autopost-engine.md) · [DONE/12](./plans/DONE/12-publish-schedule-tracking.md) | ✅ 25/07 | TimelinePage |
| M7 | Users + dọn FE còn lại | [DONE/08](./plans/DONE/08-frontend-integration.md) · [DONE/10](./plans/DONE/10-user-management-content-tracking.md) | ✅ 25/07 | UserManagementPage |
| **M8** | **Monitor: Queue · Failed Jobs · Audit Logs** | [plans/13-monitor.md](./plans/13-monitor.md) | 🟡 code+test+smoke API xong, chưa smoke UI | QueueMonitorPage, FailedJobsPage, AuditLogsPage |
| **M9** | **Tổng quan (Dashboard) chạy số liệu thật** | [plans/14-dashboard.md](./plans/14-dashboard.md) | 🟡 code+test+smoke API xong, chưa smoke UI | DashboardPage (màn cuối còn mock) |
| **M10** | **Kết nối Page bằng đăng nhập Facebook** (thay dán token tay) | [plans/15-facebook-login-connect.md](./plans/15-facebook-login-connect.md) | 🟡 code+test xong 27/07, chưa chạy với Meta app thật | PageManagementPage, SettingsPage |
| **M11** | **Tracking lượt xem bài đã đăng** (Facebook Post Insights) | [plans/25-page-post-insights.md](./plans/25-page-post-insights.md) | 🟡 code+test xong 08/08, chưa chạy với Graph thật | PageManagementPage, PageInsightsPage (mới) |
| **M12** | **Reup pipeline** — tự tìm video trending theo chủ đề, tải về, đưa vào kho, dọn file sau khi đăng | [plans/reup/README.md](./plans/reup/README.md) (6 plan: 26→31) | ⬜ chốt thiết kế 15/08, chưa code | ReupSettingsPage (mới), UserManagementPage, ContentManagementPage, AuditLogsPage |

Thứ tự đã chạy: M0 → M1 → (M2 ∥ M4) → M2.5 → M3 → M5 → **M6** → M7 → **M8** → **M9**.
M8 phụ thuộc M6 (dữ liệu `publish_jobs` + `publish_job_events`) và M1 (`audit_logs`).
M9 phụ thuộc M3 (`content_assets`), M6 (`publish_jobs`, `slot_runs`) và M8 (dùng lại
`MonitorService` để phát hiện job kẹt).
M10 phụ thuộc M4 (module page + crypto token) và mượn khuôn OAuth của plan 03c. Đây là
đường trả nợ nghiệm thu "đăng thật lên Page" (`contexts.md` §6 mục 10): user chỉ được
share quyền trên Page doanh nghiệp, không cầm System User, nên phải lấy Page token
vĩnh viễn qua đăng nhập cá nhân thay vì dán token ngắn hạn.
M11 phụ thuộc M4 (`facebook_pages` + token mã hoá) và M6 (`content_page_assignments`
đã có `facebook_post_id`). Nó **thêm scope `read_insights`** vào luồng OAuth của
M10 ⇒ mọi kết nối tạo trước 08/08 phải bấm "Kết nối lại" mới đọc được số liệu.
M12 phụ thuộc M3 (`content_assets`), M6 (auto-post engine nhặt bài) và plan 23/24
(ống `MediaUploadJob` đẩy Drive — reup **dùng lại**, không viết ống thứ hai). Nó nối
project Python `ai-video-downloader` vào backend như một *producer* đổ bài vào kho:
auto-post engine **không sửa gì**, ngoại lệ duy nhất là thêm điều kiện
`resource_deleted_at IS NULL` vào picker ở plan 30. Bộ plan tách 6 file, thứ tự
26 → 31 bắt buộc, chi tiết ở [plans/reup/README.md](./plans/reup/README.md).
Toàn bộ dữ liệu reup (chủ đề, video, bài trong kho, audit log) chỉ **SUPER_ADMIN** truy
cập được — chặn ở **service**, không chỉ ẩn ở UI, vì role khác gọi thẳng API vẫn phải
không lấy được gì.

Quy tắc cho mỗi milestone từ M3 trở đi: **không tick "Done" cho tới khi đã test được
bằng tay trên UI thật** (không phải mock, không chỉ Swagger) theo điều kiện nghiệm
thu trong file plan tương ứng.

---

## 3. Ngoài phạm vi MVP

Reconciliation cron · Nginx/production compose · Instagram/TikTok · AI caption ·
bảng rollup thống kê / cache.

**Đã chuyển vào Phase 2:** chỉ số Facebook Insights (lượt hiển thị / tiếp cận /
tương tác) — M11, plan 25. Chỉ theo dõi bài **do tool đăng**, không crawl page.

Backend **vẫn ghi** audit log (rẻ, và cron cần dấu vết), chỉ chưa làm màn hình.

**Đã chuyển vào scope Phase 2:** Queue Monitor UI · Failed Jobs UI · Audit Logs UI
(M8, plan 13) · Dashboard số liệu thật (M9, plan 14). (Retry job qua UI đã làm sớm
ở M6 tại `/timeline`.)

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

## 5. Định nghĩa Done của MVP — chốt 2026-07-25

- [x] `docker compose up` + `npm run start:dev` chạy được toàn bộ stack local
- [x] Login bằng admin seed
- [x] Upload video → thấy file trên Drive thật → content `PENDING_REVIEW`
- [x] EDITOR duyệt → `APPROVED`
- [x] Tạo page + slot → tới giờ Bot tạo job và đăng *(đường cron→job→worker→retry
      đã smoke thật với DB+Redis; **bước gọi Graph thật chưa chạy được** vì chưa có
      Page token — contexts §6 mục 10)*
- [x] Content → `PUBLISHED`, assignment có `facebook_post_id` *(logic + test xanh,
      chưa xác nhận trên Page thật — cùng lý do trên)*
- [x] Đăng lại lần 2 cùng page: **không** xảy ra (test picker + UNIQUE assignment)
- [x] Logic phức tạp có test (auto-post engine + crypto); BE 485 test xanh, lint + build xanh
- [x] `contexts.md` phản ánh đúng hiện trạng

**Nợ nghiệm thu còn lại** (không chặn việc đóng MVP, theo dõi ở `contexts.md` §6):
đăng thật lên Facebook Page (thiếu Page token — mục 10) và smoke UI thật một số
trang (mục 5, 7–9, 11–16).
