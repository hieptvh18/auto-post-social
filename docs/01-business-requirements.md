# 01 — Business Requirements

> Yêu cầu nghiệp vụ chi tiết cho triển khai coding V1 (v2.0)

---

## 1. Bối cảnh

### 1.1 Hiện trạng

```text
Content Team → Upload video lên Google Drive
            → Paste link vào Google Sheet
            → Đội đăng bài mở Sheet → copy link → đăng FB thủ công → đánh dấu đã đăng
```

### 1.2 Pain points

| Vấn đề | Impact |
|--------|--------|
| Không có workflow rõ ràng | Không biết trạng thái bài |
| Không phân quyền | Rủi ro bảo mật |
| Không biết ai xử lý bài nào | Trùng công, bỏ sót |
| Không có người duyệt | Nội dung chất lượng không kiểm soát |
| Không có lịch đăng tập trung | Trùng giờ, bỏ sót bài |
| Không retry khi lỗi | Mất bài khi API lỗi tạm thời |
| Không thống kê | Không đo hiệu quả |
| Google Sheet chỉ lưu data | Không quản lý quy trình |

### 1.3 Mục tiêu

- Loại bỏ **Google Sheet** hoàn toàn
- **Google Drive** vẫn là nơi lưu media
- **Web Admin** là cổng làm việc duy nhất cho Content, Reviewer, Publisher, Admin

---

## 2. Stakeholders & Roles

| Stakeholder | Role hệ thống | Workspace | Mục tiêu |
|-------------|---------------|-----------|----------|
| Admin IT | ADMIN | Toàn hệ thống | Cấu hình users, pages, queue, audit |
| Content Team | CONTENT | Content Library | Upload, tạo, sửa content |
| Leader | REVIEWER | Review Center | Duyệt, reject, comment |
| Publisher / Ops | PUBLISHER | Publisher Center | Schedule, caption, retry |

Chi tiết RBAC: [05-rbac.md](./05-rbac.md)

---

## 3. Workflow

### Bước 1 — Tạo Content

```text
Content User → Tạo Content → Upload Media → Google Drive → status: DRAFT
```

### Bước 2 — Submit Review

```text
Content User → Submit Review → status: WAITING_APPROVAL
```

### Bước 3 — Review

```text
Reviewer → Review → Approve → APPROVED
                  → Reject  → REJECTED (+ comment)
```

Content REJECTED có thể sửa và submit lại → WAITING_APPROVAL.

### Bước 4 — Schedule

```text
Publisher → Chọn APPROVED → Setup (caption, hashtag, fanpage, time) → status: SCHEDULED
```

### Bước 5 — Publish

```text
Đến giờ → BullMQ → Worker stream từ Drive → Facebook → SUCCESS / FAILED
FAILED → Retry (manual hoặc auto)
```

---

## 4. Content Lifecycle

```text
DRAFT
  ↓ submit review
WAITING_APPROVAL
  ↓ approve          ↓ reject
APPROVED            REJECTED → (edit) → DRAFT
  ↓ publisher schedule
SCHEDULED (publish_job)
  ↓ worker pickup
PUBLISHING
  ↓
SUCCESS / FAILED → RETRY → SUCCESS
```

---

## 5. Functional Requirements

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
| FR-02.2 | Gán role: ADMIN, CONTENT, REVIEWER, PUBLISHER | Must |
| FR-02.3 | Vô hiệu hóa user | Must |
| FR-02.4 | Không xóa admin cuối cùng | Must |

### FR-03: Facebook Page Management (ADMIN)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-03.1 | Thêm page: name, page_id, access_token | Must |
| FR-03.2 | Cập nhật token khi hết hạn | Must |
| FR-03.3 | Token encrypted at rest | Must |
| FR-03.4 | Vô hiệu hóa page | Must |

### FR-04: Content Library (CONTENT)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-04.1 | Upload ảnh/video → Google Drive | Must |
| FR-04.2 | Tạo/sửa/xóa content (status DRAFT, REJECTED) | Must |
| FR-04.3 | Submit review → WAITING_APPROVAL | Must |
| FR-04.4 | Không thấy schedule/publish UI | Must |
| FR-04.5 | Danh sách + filter (category, status, media_type) | Must |

### FR-05: Review Center (REVIEWER)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-05.1 | Danh sách WAITING_APPROVAL | Must |
| FR-05.2 | Approve → APPROVED | Must |
| FR-05.3 | Reject → REJECTED + bắt buộc comment | Must |
| FR-05.4 | Comment trên content | Must |
| FR-05.5 | Xem lịch sử review | Should |

### FR-06: Publisher Center (PUBLISHER)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-06.1 | Chỉ thấy content APPROVED | Must |
| FR-06.2 | Setup caption, hashtag, thumbnail, fanpage, publish time | Must |
| FR-06.3 | Tạo publish job → SCHEDULED | Must |
| FR-06.4 | Calendar/list view lịch đăng | Must |
| FR-06.5 | Hủy job trước khi publish | Must |
| FR-06.6 | Retry bài FAILED | Must |
| FR-06.7 | Một content → nhiều page (nhiều job) | Must |

### FR-07: Publishing Engine

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-07.1 | Publish image + video qua Graph API | Must |
| FR-07.2 | Stream download từ Google Drive (không lưu server) | Must |
| FR-07.3 | Status: SCHEDULED → PUBLISHING → SUCCESS/FAILED | Must |
| FR-07.4 | Auto retry 3 lần (exponential backoff) | Must |
| FR-07.5 | Lưu error_message, facebook_post_id | Must |

### FR-08: Dashboard

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-08.1 | Widgets: Waiting Review, Approved, Scheduled, Publishing, Success, Failed | Must |
| FR-08.2 | Top Publisher, Top Content Creator | Should |
| FR-08.3 | Posts Today / This Month | Must |

### FR-09: Queue Monitor & Failed Jobs (ADMIN, PUBLISHER)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-09.1 | Danh sách job BullMQ | Must |
| FR-09.2 | Filter theo status | Must |
| FR-09.3 | Xem chi tiết lỗi + DLQ | Must |

### FR-10: Audit Logs (ADMIN)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-10.1 | Log user, action, resource, before/after | Must |
| FR-10.2 | Actions: CRUD user/page, content status change, schedule, retry | Must |

---

## 6. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | API list p95 | < 500ms |
| Throughput | Posts/day | ~50–200 |
| Reliability | BullMQ persistence | Job không mất khi restart |
| Security | Password bcrypt, token AES-256-GCM | Must |
| Security | RBAC mọi endpoint | Must |
| Observability | Structured JSON logging (Pino) | Must |

---

## 7. User Stories (coding-ready)

### Epic A: Content Creation

```text
US-A1: Là CONTENT, tôi upload video và tạo content mới.
  AC: POST /content + POST /media/upload → drive_file_id lưu DB, status=DRAFT.

US-A2: Là CONTENT, tôi submit review khi content sẵn sàng.
  AC: PATCH /content/:id/submit → WAITING_APPROVAL; không submit nếu thiếu media.
```

### Epic B: Review

```text
US-B1: Là REVIEWER, tôi approve content đang chờ duyệt.
  AC: POST /content/:id/approve → APPROVED; audit log.

US-B2: Là REVIEWER, tôi reject kèm lý do.
  AC: POST /content/:id/reject + comment bắt buộc → REJECTED.
```

### Epic C: Publishing

```text
US-C1: Là PUBLISHER, tôi schedule bài APPROVED lên Page A lúc 08:00.
  AC: publish_job SCHEDULED; BullMQ delay đúng; calendar hiển thị.

US-C2: Là PUBLISHER, tôi retry bài failed.
  AC: POST /publish-jobs/:id/retry → QUEUED; audit log.
```

### Epic D: Admin

```text
US-D1: Là ADMIN, tôi tạo user REVIEWER mới.
  AC: POST /users role=REVIEWER; audit log.

US-D2: Là ADMIN, tôi xem audit log ai đổi lịch đăng.
  AC: Filter action=SCHEDULE_UPDATE.
```

---

## 8. Business Rules

| Rule ID | Rule |
|---------|------|
| BR-01 | PostgreSQL là source of truth — không sync sheet |
| BR-02 | DB không lưu video/file — chỉ `drive_file_id`, mimeType, size, thumbnail |
| BR-03 | Publish chỉ khi: content APPROVED + page active + token valid |
| BR-04 | CONTENT không được schedule/publish |
| BR-05 | REVIEWER không được schedule/publish |
| BR-06 | Chỉ sửa content khi status DRAFT hoặc REJECTED |
| BR-07 | Reject bắt buộc có comment |
| BR-08 | Media `image` → `/photos`; `video` → `/videos` |
| BR-09 | Caption max 63206 chars (FB limit) |

---

## 9. Web Admin Modules

| Module | Roles | Mô tả |
|--------|-------|-------|
| Authentication | All | Login, logout |
| Dashboard | All | Thống kê tổng quan |
| User Management | ADMIN | CRUD users |
| Role Management | ADMIN | Gán role |
| Content Library | CONTENT | Upload, edit, submit |
| Review Center | REVIEWER | Approve, reject, comment |
| Publisher Center | PUBLISHER | Schedule approved content |
| Schedule Calendar | PUBLISHER, ADMIN | Lịch đăng |
| Facebook Pages | ADMIN | CRUD pages + token |
| Queue Monitor | ADMIN, PUBLISHER | BullMQ status |
| Failed Jobs | ADMIN, PUBLISHER | Retry failed |
| Audit Logs | ADMIN | Lịch sử thay đổi |
| System Settings | ADMIN | Cấu hình hệ thống |

---

## 10. Acceptance Test Scenarios (E2E)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Upload video + tạo content | DRAFT, drive_file_id có |
| 2 | Submit review | WAITING_APPROVAL |
| 3 | Approve content | APPROVED |
| 4 | Schedule image post | SUCCESS trong 2 phút |
| 5 | Reject without comment | 400 validation error |
| 6 | CONTENT schedule publish | 403 |
| 7 | Invalid drive file | FAILED + error_message |
| 8 | Cancel job QUEUED | CANCELLED |

---

## 11. Assumptions & Dependencies

- Facebook App permissions: `pages_manage_posts`, `pages_show_list`, `pages_read_engagement`
- Google Service Account có quyền upload/read Drive folder
- Một organization — không multi-tenant V1
