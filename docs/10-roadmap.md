# 10 — Roadmap

> Sprint plan & task breakdown — v3.0 (mô hình Auto-Post)

---

## Phase 0 — Foundation (Sprint 1)

**Mục tiêu:** Monorepo scaffold, auth, DB, deploy local.

| Task | Owner | Done when |
|------|-------|-----------|
| Init NestJS backend + Prisma schema (gồm `content_page_assignments`, `auto_post_slots`) | BE | `prisma migrate dev` OK |
| Seed admin user (3 role enum) | BE | Login admin works |
| JWT auth (login, refresh, me) | BE | E2E auth pass |
| React + Ant Design scaffold (6 menu + Monitor group) | FE | Login page + layout |
| Docker Compose (postgres, redis) | DevOps | `docker compose up` OK |
| RBAC guard skeleton (ADMIN/EDITOR/CONTENT) | BE | 403 on wrong role |

**Deliverable:** User login, empty dashboard, health check.

---

## Phase 1 — Quản lý Ảnh/Video (Sprint 2)

**Mục tiêu:** Upload media, content CRUD + duyệt trong 1 trang.

| Task | Module |
|------|--------|
| Google Drive upload service | `google-drive` |
| `POST /media/upload` | API |
| Content CRUD qua PATCH duy nhất (field-level permission) | `content-assets` |
| Status transitions + reject_comment bắt buộc | `content-assets` |
| Phân bổ page (`content_page_assignments`, unique content×page) | `content-assets` |
| Flag `is_ads` (Đạt ADS) | `content-assets` |
| UI Quản lý Ảnh/Video Edit: filter đầy đủ + table + drawer edit | FE |

**Deliverable:** Full flow Upload → Chờ duyệt → Đã duyệt/Không duyệt trong 1 trang.

---

## Phase 2 — Auto-Post Engine (Sprint 3)

**Mục tiêu:** Cài đặt đăng tự động, cron scheduler, worker publish.

| Task | Module |
|------|--------|
| Facebook pages CRUD + token encrypt | `facebook-pages` |
| CRUD auto-post configs/slots | `auto-post` |
| **Cron scheduler mỗi phút + picker query** (unique 1 lần/page, order updated_at ASC) | `auto-post` |
| BullMQ enqueue + worker processor | `worker`, `08-bullmq` |
| Stream publish image/video | `07-facebook-publisher` |
| Cập nhật content PUBLISHING/PUBLISHED + assignments | `worker` |
| UI Cài đặt đăng bài tự động (per page, slots) | FE |
| UI Timeline (Lịch đăng bài + filter kênh/trạng thái, link FB/Drive) | FE |
| Retry + cancel endpoints (ADMIN) | `publish-jobs` |

**Deliverable:** Bot end-to-end đăng bài lên staging Facebook Page theo lịch config.

---

## Phase 3 — Ops & Admin (Sprint 4)

**Mục tiêu:** Dashboard, monitor, audit, production ready.

| Task | Module |
|------|--------|
| Dashboard: range filter, ADS count, posts-by-page (video/ảnh) | `dashboard` |
| Queue monitor + failed jobs UI | FE + API |
| Audit log interceptor (CONTENT_STATUS_CHANGE, AUTOPOST_CONFIG_UPDATE, AUTO_PUBLISH...) | `audit-logs` |
| User management UI (3 role) | FE |
| Reconciliation cron | `scheduler` |
| Nginx + production compose | `09-deployment` |
| Unit tests core services (picker query!) | BE |

**Deliverable:** V1 definition of done ([00-overview.md](./00-overview.md)).

---

## Task Breakdown by Layer

### Backend modules (priority order)

```text
1. auth, users, prisma
2. google-drive, content-assets (CRUD + duyệt + assignments)
3. facebook-pages, auto-post (slots + cron scheduler), publish-jobs
4. audit-logs, dashboard, health
5. worker: publish-facebook processor
```

### Frontend pages (priority order)

```text
1. Login, AdminLayout (6 menu + Monitor), Dashboard (skeleton)
2. ContentManagementPage (Quản lý Ảnh/Video Edit — filter, table, drawer)
3. AutoPostSettingsPage (per-page slots)
4. TimelinePage (filter kênh/trạng thái, link bài)
5. QueueMonitor, FailedJobs
6. PageManagement, UserManagement, AuditLogs
```

---

## Migration từ v2 design

| Area | Action |
|------|--------|
| Roles | 4 role → 3 role (`ADMIN`/`EDITOR`/`CONTENT`); bỏ REVIEWER/PUBLISHER |
| Content status | Bỏ DRAFT/WAITING_APPROVAL → PENDING_REVIEW/APPROVED/REJECTED/PUBLISHING/PUBLISHED |
| Review Center, Publisher Center | Xóa — duyệt gộp vào trang Quản lý Ảnh/Video (drawer edit) |
| Schedule thủ công | Thay bằng Cài đặt đăng bài tự động + cron Bot |
| content_assets | Thêm `caption`, `hashtags`, `is_ads`, `reject_comment` |
| Bảng mới | `content_page_assignments` (unique content×page), `auto_post_slots` |

---

## Phase 2+ — Future

| Feature | Priority | Notes |
|---------|----------|-------|
| Campaign grouping | Medium | Group content by campaign |
| Content Calendar view | Medium | Month view all content |
| Multi-platform | Low | Instagram, TikTok, YouTube |
| AI Caption/Hashtag | Low | LLM integration |
| Multi-level approval | Low | 2+ editor stages |
| Notifications | Medium | Email, Telegram, Slack |
| Dynamic RBAC | Low | `role_permissions` table |
| MinIO cache | Low | Reduce Drive API calls |

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| FB token expiry | UI alert `token_expire_at`, FAILED message hint |
| Large video OOM | Stream only, size limit on upload |
| Drive API quota | Monitor, backoff |
| Redis job loss | Reconciliation cron from DB |
| Cron double-fire (restart/scale) | Lock `slot_id + date` (Redis SETNX) |
| Hết bài APPROVED cho slot | Slot skip + log; dashboard widget Chờ duyệt |
| Duyệt dồn cùng lúc | Order `updated_at ASC` đảm bảo FIFO theo thời điểm duyệt |

---

## Definition of Milestones

| Milestone | Date (TBD) | Criteria |
|-----------|------------|----------|
| M1 Foundation | Sprint 1 end | Auth + DB + Docker local |
| M2 Content Flow | Sprint 2 end | Upload + duyệt trong 1 trang |
| M3 Auto-Post | Sprint 3 end | Bot đăng staging theo lịch config |
| M4 Production | Sprint 4 end | Full V1 checklist done |
