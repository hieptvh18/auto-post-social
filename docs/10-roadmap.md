# 10 — Roadmap

> Sprint plan & task breakdown — v2.0

---

## Phase 0 — Foundation (Sprint 1)

**Mục tiêu:** Monorepo scaffold, auth, DB, deploy local.

| Task | Owner | Done when |
|------|-------|-----------|
| Init NestJS backend + Prisma schema | BE | `prisma migrate dev` OK |
| Seed roles + admin user | BE | Login admin works |
| JWT auth (login, refresh, me) | BE | E2E auth pass |
| React + Ant Design scaffold | FE | Login page + layout |
| Docker Compose (postgres, redis) | DevOps | `docker compose up` OK |
| RBAC guard skeleton | BE | 403 on wrong role |

**Deliverable:** User login, empty dashboard, health check.

---

## Phase 1 — Content Workflow (Sprint 2)

**Mục tiêu:** Upload media, content CRUD, review flow.

| Task | Module |
|------|--------|
| Google Drive upload service | `google-drive` |
| `POST /media/upload` | API |
| Content CRUD + status transitions | `content-assets` |
| Submit review endpoint | `content-assets` |
| Review approve/reject + comments | `reviews`, `comments` |
| Content Library UI | FE |
| Review Center UI | FE |

**Deliverable:** Full flow DRAFT → WAITING_APPROVAL → APPROVED/REJECTED.

---

## Phase 2 — Publishing (Sprint 3)

**Mục tiêu:** Schedule, worker publish, retry.

| Task | Module |
|------|--------|
| Facebook pages CRUD + token encrypt | `facebook-pages` |
| Publish jobs CRUD | `publish-jobs` |
| BullMQ enqueue + worker processor | `worker`, `08-bullmq` |
| Stream publish image/video | `07-facebook-publisher` |
| Publisher Center UI | FE |
| Schedule Calendar UI | FE |
| Retry + cancel endpoints | `publish-jobs` |

**Deliverable:** End-to-end publish to staging Facebook Page.

---

## Phase 3 — Ops & Admin (Sprint 4)

**Mục tiêu:** Dashboard, queue monitor, audit, production ready.

| Task | Module |
|------|--------|
| Dashboard stats + charts | `dashboard` |
| Queue monitor + failed jobs UI | FE + API |
| Audit log interceptor | `audit-logs` |
| User management UI | FE |
| Reconciliation cron | `scheduler` |
| Nginx + production compose | `09-deployment` |
| Unit tests core services | BE |

**Deliverable:** V1 definition of done ([00-overview.md](./00-overview.md#10-định-nghĩa-done-v1)).

---

## Task Breakdown by Layer

### Backend modules (priority order)

```text
1. auth, users, prisma
2. google-drive, content-assets, comments, reviews
3. facebook-pages, publish-jobs
4. audit-logs, dashboard, health
5. worker: publish-facebook processor
```

### Frontend pages (priority order)

```text
1. Login, AdminLayout, Dashboard (skeleton)
2. ContentLibrary (upload + list + form)
3. ReviewCenter (approve/reject)
4. PublisherCenter + ScheduleCalendar
5. QueueMonitor, FailedJobs
6. PageManagement, UserManagement, AuditLogs
```

---

## Migration từ v1 codebase

Frontend hiện tại dùng model v1 (Google Sheet, VIEWER, `approved: boolean`).

| Area | Action |
|------|--------|
| `types/index.ts` | Add `REVIEWER`, `ContentStatus`, remove `sheetRowId` |
| `permissions.ts` | Update per [05-rbac.md](./05-rbac.md) |
| ContentLibraryPage | Remove sync UI, add upload |
| New pages | ReviewCenter, PublisherCenter |
| mock data | Align v2 schema |

---

## Phase 2+ — Future

| Feature | Priority | Notes |
|---------|----------|-------|
| Campaign grouping | Medium | Group content by campaign |
| Content Calendar view | Medium | Month view all content |
| Multi-platform | Low | Instagram, TikTok, YouTube |
| AI Caption/Hashtag | Low | OpenAI integration |
| Multi-level approval | Low | 2+ reviewer stages |
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
| Review bottleneck | Dashboard widget Waiting Review count |

---

## Definition of Milestones

| Milestone | Date (TBD) | Criteria |
|-----------|------------|----------|
| M1 Foundation | Sprint 1 end | Auth + DB + Docker local |
| M2 Content Flow | Sprint 2 end | Upload + review workflow |
| M3 Publish | Sprint 3 end | FB publish staging |
| M4 Production | Sprint 4 end | Full V1 checklist done |
