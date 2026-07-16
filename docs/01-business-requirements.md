# 01 — Business Requirements

> Yêu cầu nghiệp vụ chi tiết cho triển khai coding — v3.0 (mô hình Auto-Post)

---

## 1. Bối cảnh

### 1.1 Hiện trạng

```text
Content Team → Upload video/ảnh lên Google Drive
            → Paste link vào Google Sheet
            → Đội đăng bài mở Sheet → copy link → đăng FB thủ công → đánh dấu đã đăng
```

### 1.2 Pain points

| Vấn đề | Impact |
|--------|--------|
| Không có workflow rõ ràng | Không biết trạng thái bài |
| Không phân quyền | Rủi ro bảo mật |
| Đăng bài thủ công từng bài | Tốn công, trùng giờ, bỏ sót |
| Không có người duyệt | Nội dung chất lượng không kiểm soát |
| Không retry khi lỗi | Mất bài khi API lỗi tạm thời |
| Không thống kê | Không đo hiệu quả, không biết bài nào đạt ADS |
| Google Sheet chỉ lưu data | Không quản lý quy trình |

### 1.3 Mục tiêu (thay đổi lớn v3.0)

- Loại bỏ **Google Sheet** hoàn toàn — **Web Admin** là cổng làm việc duy nhất
- **Google Drive** vẫn là nơi lưu media
- **1 trang quản lý duy nhất** (Quản lý Ảnh/Video Edit) hoạt động như file sheet Excel: mọi thông tin + thao tác duyệt nằm ở đây, **không còn Review Center / Publisher Center riêng**
- **Đăng bài hoàn toàn tự động bởi Bot**: cấu hình lịch đăng 1 lần cho từng FB Page (Cài đặt đăng bài tự động), bot cron tự lấy bài đã duyệt và đăng theo mốc giờ — dùng cho suốt vòng đời, chỉ thay đổi khi cần

---

## 2. Stakeholders & Roles

| Stakeholder | Role hệ thống | Mục tiêu |
|-------------|---------------|----------|
| Admin IT | ADMIN | Toàn quyền: users, pages, cài đặt auto-post, monitor |
| Leader / Biên tập | EDITOR | Duyệt bài (đổi trạng thái trong trang Quản lý Ảnh/Video), đánh dấu Đạt ADS, quản lý cài đặt đăng tự động, xem timeline |
| Content Team | CONTENT | Upload, sửa content của mình, nhập caption/hashtag, phân bổ page |
| Bot (hệ thống) | — | Tự động đăng bài theo Cài đặt đăng bài tự động |

Chi tiết RBAC: [05-rbac.md](./05-rbac.md)

---

## 3. Menu chính (6 mục + Monitor)

| # | Menu | Route | Roles |
|---|------|-------|-------|
| 1 | Tổng quan (Dashboard) | `/dashboard` | All |
| 2 | Quản lý Ảnh/Video Edit | `/content` | All (CONTENT chỉ thấy bài của mình) |
| 3 | Lịch đăng bài (Timeline) | `/timeline` | ADMIN, EDITOR |
| 4 | Cài đặt đăng bài tự động | `/auto-post` | ADMIN, EDITOR |
| 5 | Quản lý FB Pages | `/pages` | ADMIN |
| 6 | Quản lý nhân sự | `/users` | ADMIN |
| — | Monitor: Queue / Failed Jobs / Audit Logs | `/queue`, `/failed`, `/audit` | ADMIN |

---

## 4. Workflow

### Bước 1 — Upload

```text
CONTENT → Upload ảnh/video → Google Drive → nhập tiêu đề, mô tả, dạng (danh mục),
caption đăng bài, hashtags, phân bổ page → status: Chờ duyệt (PENDING_REVIEW)
```

Không còn trạng thái DRAFT và action "Gửi duyệt" — upload xong vào thẳng Chờ duyệt.

### Bước 2 — Duyệt (trong chính trang Quản lý Ảnh/Video)

```text
EDITOR/ADMIN → mở form edit (drawer) → đổi trạng thái:
  Đã duyệt (APPROVED)      → bài sẵn sàng cho bot đăng
  Không duyệt (REJECTED)    → bắt buộc nhập lý do; CONTENT sửa lại → Chờ duyệt
Đồng thời có thể tick "Đạt ADS" (is_ads) cho video/bài đạt chuẩn quảng cáo.
```

### Bước 3 — Bot đăng tự động

```text
Cron quét Cài đặt đăng bài tự động → đến mốc giờ của page:
  lấy bài APPROVED thuộc Dạng đã chọn, phân bổ cho page đó,
  chưa từng đăng trên page đó (unique content × page),
  order by updated_at ASC (duyệt sớm → đăng trước)
→ tạo publish_job → BullMQ worker stream media từ Drive → Meta Graph API
```

### Bước 4 — Cập nhật trạng thái

```text
Job chạy → content: Đang đăng (PUBLISHING)
Đăng thành công ≥ 1 page → content: Đã đăng (PUBLISHED), UI hiện badge x/y page
FAILED → auto retry 3 lần → vẫn lỗi thì vào Failed Jobs (ADMIN retry tay)
```

---

## 5. Content Lifecycle

```text
(upload)
PENDING_REVIEW  (Chờ duyệt)
  ↓ EDITOR duyệt                ↓ EDITOR không duyệt
APPROVED (Đã duyệt)            REJECTED (Không duyệt) → CONTENT sửa → PENDING_REVIEW
  ↓ bot lấy bài theo lịch auto-post
PUBLISHING (Đang đăng — job đang chạy, badge x/y page)
  ↓ đăng thành công ≥ 1 page
PUBLISHED (Đã đăng — badge x/y page cho biết tiến độ trên các page còn lại)
```

Quy ước trạng thái tổng khi phân bổ nhiều page: content được coi là **Đã đăng ngay khi
đăng thành công trên ít nhất 1 page**; UI luôn kèm badge `x/y page` để phân biệt
tiến độ (đã đăng x trên tổng y page được phân bổ).

---

## 6. Functional Requirements

### FR-01: Authentication

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01.1 | Login email + password | Must |
| FR-01.2 | JWT access + refresh token | Must |
| FR-01.3 | Chỉ user `is_active=true` login được | Must |

### FR-02: User & Role Management (ADMIN)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-02.1 | CRUD users | Must |
| FR-02.2 | Gán role: ADMIN, EDITOR, CONTENT | Must |
| FR-02.3 | Vô hiệu hóa user | Must |
| FR-02.4 | Không xóa admin cuối cùng | Must |

### FR-03: Facebook Page Management (ADMIN)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-03.1 | Thêm page: name, page_id, access_token | Must |
| FR-03.2 | Cập nhật token khi hết hạn | Must |
| FR-03.3 | Token encrypted at rest | Must |
| FR-03.4 | Vô hiệu hóa page | Must |

### FR-04: Quản lý Ảnh/Video Edit (All roles)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-04.1 | Upload ảnh/video → Google Drive, status mặc định Chờ duyệt | Must |
| FR-04.2 | Bộ lọc: range ngày cập nhật, người upload, dạng (danh mục), trạng thái, search tên/tiêu đề | Must |
| FR-04.3 | Table: No, Ngày upload, Tiêu đề, Trạng thái, Dạng, Link, Phân bổ page, Ngày cập nhật | Must |
| FR-04.4 | Edit qua drawer: đầy đủ field, gồm caption/hashtags, phân bổ nhiều page | Must |
| FR-04.5 | EDITOR/ADMIN đổi trạng thái duyệt ngay trong drawer (không có trang Review riêng) | Must |
| FR-04.6 | Checkbox "Đạt ADS" (is_ads) — chỉ hiện trong drawer edit, EDITOR/ADMIN | Must |
| FR-04.7 | Không duyệt bắt buộc nhập lý do | Must |
| FR-04.8 | Xóa content (Popconfirm); CONTENT chỉ thao tác trên bài của mình | Must |
| FR-04.9 | Trạng thái Đang đăng/Đã đăng do bot cập nhật — không set tay | Must |

### FR-05: Cài đặt đăng bài tự động (ADMIN, EDITOR)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-05.1 | Cấu hình theo từng FB Page: bật/tắt auto-post | Must |
| FR-05.2 | Mỗi page nhiều mốc giờ trong ngày (VD: sáng/trưa/tối) | Must |
| FR-05.3 | Mỗi mốc giờ chọn riêng: dạng bài (nhiều danh mục), loại media (ảnh/video/tất cả), số bài/lần | Must |
| FR-05.4 | Bật/tắt từng mốc giờ độc lập | Must |
| FR-05.5 | Config 1 lần dùng suốt vòng đời — chỉ sửa khi cần | Must |

### FR-06: Publishing Engine (Bot)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-06.1 | Cron quét mốc giờ auto-post mỗi phút | Must |
| FR-06.2 | Chọn bài: status APPROVED + đúng dạng/media của slot + được phân bổ cho page | Must |
| FR-06.3 | **Unique content × page** — mỗi bài chỉ đăng 1 lần trên 1 page | Must |
| FR-06.4 | Thứ tự lấy bài: `updated_at ASC` (duyệt sớm đăng trước) | Must |
| FR-06.5 | Publish image `/photos`, video `/videos` qua Graph API; stream từ Drive | Must |
| FR-06.6 | Auto retry 3 lần (exponential backoff), lưu error_message, facebook_post_id | Must |
| FR-06.7 | Cập nhật content status PUBLISHING/PUBLISHED + published_page_ids | Must |

### FR-07: Timeline — Lịch đăng bài (ADMIN, EDITOR)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-07.1 | Timeline theo giờ trong ngày, chọn ngày | Must |
| FR-07.2 | Filter cột trái: Kênh (FB page), Trạng thái, Người đăng (cố định Bot) | Must |
| FR-07.3 | Card bài: link tới bài FB (facebook_post_id) + link media Drive | Must |
| FR-07.4 | Hiển thị dạng bài, loại media, caption, giờ đăng thực tế | Must |

### FR-08: Dashboard — Tổng quan (All)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-08.1 | Filter chung theo khoảng ngày/tháng/năm (RangePicker + presets) | Must |
| FR-08.2 | Thống kê video đạt ADS (flag `is_ads`) | Must |
| FR-08.3 | Thống kê bài đăng theo từng page — filter riêng video/ảnh | Must |
| FR-08.4 | Widgets: Chờ duyệt, Đã duyệt, Đang đăng, Thành công, Thất bại, Pages/Users active | Must |
| FR-08.5 | Chart bài đăng theo ngày + tỷ lệ thành công/thất bại | Must |

### FR-09: Monitor (ADMIN)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-09.1 | Queue Monitor: danh sách job BullMQ, filter status | Must |
| FR-09.2 | Failed Jobs: xem chi tiết lỗi + retry tay | Must |
| FR-09.3 | Audit Logs: user, action, resource, before/after | Must |

---

## 7. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | API list p95 | < 500ms |
| Throughput | Posts/day | ~50–200 |
| Reliability | BullMQ persistence | Job không mất khi restart |
| Security | Password bcrypt, token AES-256-GCM | Must |
| Security | RBAC mọi endpoint | Must |
| Observability | Structured JSON logging (Pino) | Must |

---

## 8. User Stories (coding-ready)

### Epic A: Content

```text
US-A1: Là CONTENT, tôi upload video kèm caption, dạng bài và phân bổ page.
  AC: POST /content-assets + POST /media/upload → drive_file_id lưu DB,
      status=PENDING_REVIEW, caption bắt buộc.

US-A2: Là CONTENT, tôi sửa bài bị Không duyệt và bài tự quay lại Chờ duyệt.
  AC: PATCH /content-assets/:id khi status=REJECTED → PENDING_REVIEW, reject_comment=null.
```

### Epic B: Duyệt bài (trong trang Quản lý Ảnh/Video)

```text
US-B1: Là EDITOR, tôi mở drawer edit và đổi trạng thái sang Đã duyệt.
  AC: PATCH /content-assets/:id {status: APPROVED} → audit log CONTENT_STATUS_CHANGE.

US-B2: Là EDITOR, tôi Không duyệt kèm lý do.
  AC: PATCH {status: REJECTED, reject_comment} — comment bắt buộc, 400 nếu thiếu.

US-B3: Là EDITOR, tôi tick "Đạt ADS" cho video đạt chuẩn.
  AC: PATCH {is_ads: true} → dashboard đếm vào "Video đạt ADS".
```

### Epic C: Auto-Post

```text
US-C1: Là EDITOR, tôi cấu hình page A đăng 3 mốc: 08:00 (video Cơ xương khớp/Thăm khám),
       11:30 (ảnh Giáo dục sức khỏe), 19:30 (2 bài Khuyến mãi/Sự kiện).
  AC: POST /auto-post-configs/:pageId/slots — bot đăng đúng mốc, đúng dạng.

US-C2: Là hệ thống, đến 08:00 bot lấy bài APPROVED dạng phù hợp chưa đăng page A,
       duyệt sớm nhất trước.
  AC: query unique(content, page), order updated_at ASC, tạo publish_job.

US-C3: Là ADMIN, tôi retry bài failed.
  AC: POST /publish-jobs/:id/retry → QUEUED; audit log.
```

### Epic D: Admin

```text
US-D1: Là ADMIN, tôi tạo user EDITOR mới.
  AC: POST /users role=EDITOR; audit log.

US-D2: Là ADMIN, tôi xem audit log ai đổi cài đặt auto-post.
  AC: Filter action=AUTOPOST_CONFIG_UPDATE.
```

---

## 9. Business Rules

| Rule ID | Rule |
|---------|------|
| BR-01 | PostgreSQL là source of truth — không sync sheet |
| BR-02 | DB không lưu video/file — chỉ `drive_file_id`, mimeType, size, thumbnail |
| BR-03 | Bot chỉ đăng khi: content APPROVED + page active + token valid + slot enabled |
| BR-04 | **Mỗi content chỉ đăng 1 lần trên 1 page** (unique content × page) |
| BR-05 | Thứ tự đăng: `updated_at ASC` trong pool bài đủ điều kiện |
| BR-06 | CONTENT chỉ sửa/xóa bài của mình; không đổi trạng thái duyệt, không sửa is_ads |
| BR-07 | Không duyệt bắt buộc có lý do (reject_comment) |
| BR-08 | Trạng thái PUBLISHING/PUBLISHED do bot cập nhật, không set tay |
| BR-09 | Content = Đã đăng khi thành công ≥ 1 page; UI luôn kèm badge x/y page |
| BR-10 | Media `image` → `/photos`; `video` → `/videos` |
| BR-11 | Caption max 63206 chars (FB limit) |

---

## 10. Acceptance Test Scenarios (E2E)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Upload video + caption + phân bổ 2 page | PENDING_REVIEW, drive_file_id có |
| 2 | EDITOR đổi trạng thái Đã duyệt trong drawer | APPROVED + audit log |
| 3 | Không duyệt thiếu lý do | 400 validation error |
| 4 | Đến mốc giờ slot 08:00 page A | Job tạo cho bài APPROVED duyệt sớm nhất, đúng dạng |
| 5 | Bài đã đăng page A, slot page A quét lại | Bài KHÔNG được chọn lại (unique) |
| 6 | Bài đăng thành công 1/2 page | Content PUBLISHED, badge 1/2 page |
| 7 | CONTENT đổi status bài | 403 |
| 8 | Invalid drive file | FAILED + error_message, retry 3 lần |
| 9 | Dashboard filter tháng 7 | Số liệu chỉ tính trong tháng 7, đếm đúng video đạt ADS |

---

## 11. Assumptions & Dependencies

- Facebook App permissions: `pages_manage_posts`, `pages_show_list`, `pages_read_engagement`
- Google Service Account có quyền upload/read Drive folder
- Một organization — không multi-tenant V1
