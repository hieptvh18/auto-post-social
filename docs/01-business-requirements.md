# 01 — Business Requirements

> Yêu cầu nghiệp vụ chi tiết cho triển khai coding V1

---

## 1. Bối cảnh

### 1.1 Hiện trạng

- Đội Content tạo nội dung trên **Google Sheet**
- Media (ảnh/video) lưu trên **Google Drive**
- Đội vận hành đăng thủ công lên nhiều Facebook Page (~50 bài/ngày)
- Không có audit, phân quyền, retry, hoặc dashboard tập trung

### 1.2 Pain points

| Vấn đề | Impact |
|--------|--------|
| Tốn nhân lực | Chi phí vận hành cao |
| Khó kiểm soát lịch | Trùng giờ, bỏ sót bài |
| Không audit | Không truy vết ai đổi gì |
| Không phân quyền | Rủi ro bảo mật |
| Không retry | Mất bài khi API lỗi tạm thời |

---

## 2. Stakeholders & Roles

| Stakeholder | Vai trò hệ thống | Mục tiêu |
|-------------|------------------|----------|
| Admin IT | ADMIN | Cấu hình hệ thống, users, pages |
| Content Team | CONTENT | Tạo/duyệt nội dung, sync sheet |
| Publisher / Ops | PUBLISHER | Lên lịch và đăng bài |
| Manager | VIEWER | Xem báo cáo, không sửa |

---

## 3. Functional Requirements

### FR-01: Authentication

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01.1 | User đăng nhập bằng email + password | Must |
| FR-01.2 | JWT access token (ngắn hạn) + refresh token | Must |
| FR-01.3 | Chỉ user `is_active=true` được login | Must |
| FR-01.4 | Logout invalidate refresh token (optional V1: client-side only) | Should |

### FR-02: User Management (ADMIN)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-02.1 | Tạo/sửa/xóa user | Must |
| FR-02.2 | Gán role: ADMIN, CONTENT, PUBLISHER, VIEWER | Must |
| FR-02.3 | Vô hiệu hóa user (`is_active=false`) | Must |
| FR-02.4 | Không cho xóa user cuối cùng có role ADMIN | Must |

### FR-03: Facebook Page Management (ADMIN)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-03.1 | Thêm Page: `page_name`, `page_id`, `access_token` | Must |
| FR-03.2 | Cập nhật token khi hết hạn | Must |
| FR-03.3 | Hiển thị `token_expire_at` (nếu có) | Should |
| FR-03.4 | Vô hiệu hóa page (`is_active=false`) | Must |
| FR-03.5 | Token lưu encrypted, không hiển thị full trên UI | Must |

### FR-04: Content Library

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-04.1 | Danh sách content với search/filter (category, approved, media_type) | Must |
| FR-04.2 | Sync từ Google Sheet (manual trigger) | Must |
| FR-04.3 | Upsert theo `sheet_row_id` — không duplicate | Must |
| FR-04.4 | CONTENT role: approve/unapprove content | Must |
| FR-04.5 | Chỉ content `approved=true` mới được schedule publish | Must |
| FR-04.6 | Hiển thị `drive_url`, `caption`, `title` | Must |

### FR-05: Publish Scheduler

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-05.1 | Tạo publish job: chọn content + page + `scheduled_at` | Must |
| FR-05.2 | Calendar/list view theo ngày/giờ | Must |
| FR-05.3 | Hủy job trước khi publish (status → CANCELLED) | Must |
| FR-05.4 | Không cho schedule quá khứ (trừ publish ngay) | Must |
| FR-05.5 | Một content có thể publish lên nhiều page (nhiều job) | Must |
| FR-05.6 | Tránh trùng: cùng content + page + scheduled_at (trong 1 phút) | Should |

### FR-06: Publishing Engine

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-06.1 | Publish text + image qua Graph API | Must |
| FR-06.2 | Publish video qua Graph API | Must |
| FR-06.3 | Download media từ Google Drive URL | Must |
| FR-06.4 | Cập nhật status realtime: QUEUED → PUBLISHING → SUCCESS/FAILED | Must |
| FR-06.5 | Retry tự động 3 lần (exponential backoff) | Must |
| FR-06.6 | Retry thủ công từ UI (PUBLISHER/ADMIN) | Must |
| FR-06.7 | Lưu `error_message` khi FAILED | Must |
| FR-06.8 | Lưu `facebook_post_id` khi SUCCESS | Should |

### FR-07: Dashboard

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-07.1 | Tổng posts (theo khoảng thời gian) | Must |
| FR-07.2 | Success / Failed count | Must |
| FR-07.3 | Số page active, user active | Must |
| FR-07.4 | Biểu đồ posts theo ngày (7/30 ngày) | Should |

### FR-08: Queue Monitor

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-08.1 | Danh sách job: status, attempts, scheduled_at | Must |
| FR-08.2 | Filter theo status | Must |
| FR-08.3 | Xem chi tiết lỗi failed job | Must |

### FR-09: Audit Logs

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-09.1 | Ghi log: user, action, resource, old/new value | Must |
| FR-09.2 | Actions: user CRUD, page CRUD, schedule change, retry, sync | Must |
| FR-09.3 | ADMIN xem toàn bộ; VIEWER không xem | Must |

---

## 4. Non-Functional Requirements

### NFR-01: Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01.1 | API response (list) | < 500ms p95 |
| NFR-01.2 | Throughput | 200 posts/day, 20 pages |
| NFR-01.3 | Sync sheet 1000 rows | < 30s |

### NFR-02: Reliability

| ID | Requirement |
|----|-------------|
| NFR-02.1 | Job không mất khi worker restart (BullMQ persistence) |
| NFR-02.2 | Idempotent publish: check status trước khi gọi FB API |
| NFR-02.3 | DB transaction cho sync upsert batch |

### NFR-03: Security

| ID | Requirement |
|----|-------------|
| NFR-03.1 | Password bcrypt (cost ≥ 10) |
| NFR-03.2 | Facebook token AES-256-GCM encrypted at rest |
| NFR-03.3 | RBAC trên mọi endpoint |
| NFR-03.4 | Rate limit login (optional V1) |

### NFR-04: Observability

| ID | Requirement |
|----|-------------|
| NFR-04.1 | Structured logging (JSON) |
| NFR-04.2 | Correlation ID per request |
| NFR-04.3 | Sentry/Prometheus — V2 |

---

## 5. User Stories (coding-ready)

### Epic A: Auth & Users

```text
US-A1: Là ADMIN, tôi tạo user mới với email và role để phân quyền truy cập.
  AC: POST /api/users → 201, audit log created, password hashed.

US-A2: Là user, tôi login để vào Web Admin.
  AC: POST /api/auth/login → access + refresh token; inactive user → 403.
```

### Epic B: Content Sync

```text
US-B1: Là CONTENT, tôi bấm "Sync Sheet" để import content mới.
  AC: Rows mới upsert; rows đã có update nếu updated_at thay đổi; sync log trả về {created, updated, skipped}.

US-B2: Là CONTENT, tôi approve content để Publisher có thể schedule.
  AC: PATCH approved=true; audit log; chỉ CONTENT/ADMIN.
```

### Epic C: Publishing

```text
US-C1: Là PUBLISHER, tôi schedule bài lên Page A lúc 08:00.
  AC: publish_job created APPROVED→QUEUED; BullMQ job delay đúng; calendar hiển thị.

US-C2: Là PUBLISHER, tôi retry bài failed.
  AC: POST retry → status QUEUED, attempts reset hoặc increment theo design; audit log.
```

### Epic D: Monitoring

```text
US-D1: Là VIEWER, tôi xem dashboard thống kê tuần này.
  AC: GET /api/dashboard/stats?from=&to= → counts chính xác.

US-D2: Là ADMIN, tôi xem audit log ai đổi lịch đăng.
  AC: Filter action=SCHEDULE_UPDATE; old/new value JSON.
```

---

## 6. Business Rules

| Rule ID | Rule |
|---------|------|
| BR-01 | Google Sheet không phải source of truth — DB wins khi conflict manual edit |
| BR-02 | `sheet_row_id` unique — key dedup sync |
| BR-03 | Publish chỉ khi: content approved + page active + token valid |
| BR-04 | Job CANCELLED không được worker xử lý |
| BR-05 | Job SUCCESS không retry (trừ tạo job mới) |
| BR-06 | Media type `image` → `/photos`; `video` → `/videos` |
| BR-07 | Caption max length theo FB limit (63206 chars) — validate trước queue |

---

## 7. Google Sheet Column Contract

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| id | string | Yes | Maps to `sheet_row_id`, e.g. CNT-001 |
| category | string | No | Filter UI |
| title | string | Yes | Display only |
| caption | string | Yes | FB post message |
| media_type | enum | Yes | `image` \| `video` |
| drive_url | url | Yes | Public or service-account accessible |
| approved | boolean | Yes | TRUE/FALSE string parsed |
| owner | string | No | Metadata |
| updated_at | datetime | No | ISO hoặc sheet date — dùng detect changes |

---

## 8. Publish Job State Machine

```text
DRAFT       → (optional, nếu cần workflow phức tạp hơn)
APPROVED    → user tạo job, chưa vào queue
QUEUED      → đã add BullMQ
PUBLISHING  → worker đang xử lý
SUCCESS     → terminal
FAILED      → terminal (có thể retry → QUEUED)
CANCELLED   → terminal
```

**V1 đơn giản hóa:** Tạo job → trực tiếp `APPROVED` → scheduler push `QUEUED`.

---

## 9. Acceptance Test Scenarios (E2E)

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Sync sheet 10 rows mới | 10 content_assets created |
| 2 | Sync lại không đổi | 0 updated (hoặc skipped) |
| 3 | Schedule image post | SUCCESS trong 2 phút (staging page) |
| 4 | Invalid drive_url | FAILED + error_message |
| 5 | Expired FB token | FAILED + hint refresh token |
| 6 | PUBLISHER không tạo user | 403 |
| 7 | Cancel job đang QUEUED | CANCELLED, BullMQ job removed |

---

## 10. Assumptions & Dependencies

- Có Facebook App đã review permissions: `pages_manage_posts`, `pages_show_list`, `pages_read_engagement`, `business_management`
- Google Service Account có quyền đọc Sheet + Drive files
- Drive URLs có thể download được bởi backend (shared link hoặc SA)
- Một organization — không multi-tenant V1
