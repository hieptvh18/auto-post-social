# 00 — Overview

> Tool Auto FB (Luca) — Tài liệu tổng quan triển khai coding

**Version:** v3.0 (mô hình Auto-Post)  
**Tham chiếu:** [Plan.md](../Plan.md)

---

## 1. Tóm tắt dự án

Nền tảng nội bộ quản lý content và **tự động đăng bài lên Facebook Page bằng Bot**.

```text
Content/Editor → Web Admin (1 trang quản lý Ảnh/Video như sheet Excel:
                 upload + edit + duyệt + phân bổ page)
         ↓
    PostgreSQL (source of truth)
         ↓
Cài đặt đăng bài tự động (per FB Page: mốc giờ + dạng bài + số lượng)
         ↓
Cron Scheduler (Bot) → BullMQ Worker → Google Drive (stream) → Meta Graph API → FB Pages
```

**Google Sheet bị loại bỏ hoàn toàn.** Web Admin là cổng làm việc duy nhất.
**Không còn Review Center / Publisher Center** — duyệt bài nằm trong trang quản lý,
đăng bài do Bot chạy theo lịch đã config.

---

## 2. Mục tiêu V1

| Mục tiêu | Mô tả |
|----------|--------|
| 1 trang quản lý Ảnh/Video | Upload, edit (drawer), duyệt trạng thái, Đạt ADS, phân bổ page — như file Excel |
| Content workflow | Chờ duyệt → Đã duyệt/Không duyệt → (Bot) Đang đăng → Đã đăng |
| Auto-Post | Config lịch per page (mốc giờ + dạng + media + số bài) — 1 lần, dùng suốt vòng đời |
| Cron + BullMQ | Bot quét slot, lấy bài Đã duyệt (unique 1 lần/page, duyệt sớm đăng trước), retry, DLQ |
| Timeline | Lịch đăng bài theo ngày, filter kênh/trạng thái, link bài FB/Drive |
| RBAC | 3 role: ADMIN, EDITOR, CONTENT |
| Dashboard | Filter theo khoảng thời gian; video đạt ADS; bài đăng theo page (video/ảnh) |
| Audit log | Ghi lại mọi thay đổi quan trọng |

---

## 3. Out of Scope (V1)

- Google Sheet sync
- Facebook Group / Profile
- Instagram, TikTok, YouTube
- AI caption/hashtag
- Multi-tenant SaaS
- Lưu video/file trên server (chỉ stream từ Drive)

---

## 4. Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| Backend API | NestJS, TypeScript, Prisma, Pino |
| Database | PostgreSQL 16 |
| Queue + Cron | BullMQ + Redis 7, @nestjs/schedule |
| Auth | JWT (access + refresh) |
| Frontend | React, Ant Design, React Query, React Router |
| Integrations | Google Drive API v3, Meta Graph API |
| Infra | Docker Compose, Nginx |

---

## 5. Cấu trúc monorepo

```text
tool-auto-fb/
├── docs/                    # Tài liệu (bạn đang đọc)
├── backend/                 # NestJS API
│   ├── prisma/
│   └── src/
│       ├── modules/
│       │   ├── auth/
│       │   ├── users/
│       │   ├── facebook-pages/
│       │   ├── content-assets/    # CRUD + duyệt + assignments
│       │   ├── auto-post/         # slots config + cron scheduler
│       │   ├── publish-jobs/
│       │   ├── google-drive/
│       │   ├── audit-logs/
│       │   └── dashboard/
│       ├── common/
│       └── config/
├── worker/                  # BullMQ consumer (process riêng)
│   └── src/
│       ├── processors/
│       └── publishers/
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── ContentManagementPage.tsx   # Quản lý Ảnh/Video Edit
│       │   ├── AutoPostSettingsPage.tsx    # Cài đặt đăng bài tự động
│       │   ├── TimelinePage.tsx            # Lịch đăng bài
│       │   ├── DashboardPage.tsx
│       │   └── ...
│       ├── components/
│       ├── contexts/
│       └── api/
├── docker/
│   ├── docker-compose.yml
│   └── nginx/
└── .env.example
```

---

## 6. Nguyên tắc coding (bắt buộc)

1. **NestJS Modular** — mỗi domain = 1 module
2. **Repository pattern** — controller không gọi Prisma trực tiếp
3. **DTO + class-validator** — validate mọi input
4. **Swagger** — document tất cả endpoints
5. **RBAC Guards** — permission-based; PATCH content kiểm tra quyền theo field
6. **Audit interceptor** — log thay đổi quan trọng (kể cả Bot AUTO_PUBLISH)
7. **Không lưu plaintext token** — encrypt `access_token` Facebook
8. **Không lưu media trên server** — stream từ Google Drive khi publish
9. **ConfigModule** — mọi secret qua env
10. **Idempotent cron** — lock slot/date, unique content×page

---

## 7. Luồng nghiệp vụ chính

```mermaid
sequenceDiagram
    participant CU as Content User
    participant ED as Editor
    participant API as NestJS API
    participant GD as Google Drive
    participant DB as PostgreSQL
    participant CR as Cron (Bot)
    participant Q as BullMQ
    participant W as Worker
    participant FB as Meta Graph API

    CU->>API: Upload media + caption + phân bổ page
    API->>GD: Upload file
    GD-->>API: fileId
    API->>DB: content_assets (PENDING_REVIEW) + assignments

    ED->>API: PATCH status = APPROVED (trong trang Quản lý Ảnh/Video)
    API->>DB: APPROVED, updated_at = mốc xếp hàng

    CR->>DB: Đến mốc giờ slot: pick APPROVED, đúng dạng,<br/>chưa đăng page (unique), order updated_at ASC
    CR->>DB: publish_jobs (QUEUED, created_by=Bot)
    CR->>Q: enqueue

    Q->>W: dequeue
    W->>DB: content → PUBLISHING
    W->>GD: Stream download
    W->>FB: POST photos/videos (caption + hashtags)
    FB-->>W: post_id
    W->>DB: job SUCCESS, assignment.published_at,<br/>content → PUBLISHED (badge x/y page)
```

---

## 8. Biến môi trường cốt lõi

```env
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api
TZ_DISPLAY=Asia/Ho_Chi_Minh   # timezone slot auto-post

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/tool_auto_fb

# Redis / BullMQ
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Encryption (Facebook tokens)
TOKEN_ENCRYPTION_KEY=  # 32 bytes hex

# Google Drive
GOOGLE_SERVICE_ACCOUNT_JSON=  # path hoặc base64
GOOGLE_DRIVE_FOLDER_ID=       # folder upload mặc định

# Meta
META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v21.0
```

---

## 9. Index tài liệu

| File | Nội dung |
|------|----------|
| [01-business-requirements.md](./01-business-requirements.md) | User stories, workflow, acceptance criteria |
| [02-architecture.md](./02-architecture.md) | Kiến trúc chi tiết, cron scheduler, module boundaries |
| [03-database-design.md](./03-database-design.md) | Prisma schema, assignments/slots, cron picker query |
| [04-api-spec.md](./04-api-spec.md) | REST API đầy đủ |
| [05-rbac.md](./05-rbac.md) | 3 role, permissions, guards |
| [06-google-drive.md](./06-google-drive.md) | Upload, stream, thumbnail |
| [07-facebook-publisher.md](./07-facebook-publisher.md) | Graph API, media upload |
| [08-bullmq.md](./08-bullmq.md) | Cron auto-post, queue, worker, retry, DLQ |
| [09-deployment.md](./09-deployment.md) | Docker, Nginx, production |
| [10-roadmap.md](./10-roadmap.md) | Sprint plan, task breakdown |

---

## 10. Định nghĩa Done (V1)

- [ ] User login/logout, refresh token
- [ ] CRUD users + gán role (ADMIN) — 3 role
- [ ] CRUD Facebook pages + token encrypted
- [ ] Upload media → Google Drive, lưu metadata DB, status Chờ duyệt
- [ ] Trang Quản lý Ảnh/Video: filter đầy đủ, table, drawer edit full-field
- [ ] Duyệt trong drawer: Đã duyệt / Không duyệt (+lý do), tick Đạt ADS
- [ ] Phân bổ page (unique content × page)
- [ ] Cài đặt đăng bài tự động: CRUD slots per page
- [ ] Cron Bot: pick bài đúng luật (APPROVED, đúng dạng, 1 lần/page, updated_at ASC)
- [ ] Worker stream publish image + video (không lưu file server)
- [ ] Content PUBLISHING → PUBLISHED + badge x/y page
- [ ] Timeline: filter kênh/trạng thái, link bài FB/Drive
- [ ] Retry failed jobs + DLQ monitor
- [ ] Dashboard: range filter, ADS count, posts theo page (video/ảnh)
- [ ] Audit log cho actions quan trọng
- [ ] Docker Compose chạy full stack local
- [ ] Unit tests cho core services (đặc biệt cron picker)
