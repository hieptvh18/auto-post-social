# 00 — Overview

> Social Publishing Automation Platform — Tài liệu tổng quan triển khai coding

**Version:** v1.0  
**Tham chiếu:** [Plan.md](../Plan.md)

---

## 1. Tóm tắt dự án

Nền tảng nội bộ tự động hóa đăng bài lên **Facebook Page**, với luồng dữ liệu:

```text
Content Team → Google Sheet → Sync Service → PostgreSQL → Web Admin / BullMQ Worker → Meta Graph API → Facebook Pages
```

**PostgreSQL** là Single Source of Truth. Google Sheet chỉ là workspace cho đội Content.

---

## 2. Mục tiêu V1

| Mục tiêu | Mô tả |
|----------|--------|
| Tự động publish | Đăng image/video lên Facebook Page theo lịch |
| Web Admin | Quản lý content, lịch đăng, pages, users |
| RBAC | 4 role: ADMIN, CONTENT, PUBLISHER, VIEWER |
| Google Sheet Sync | Import/upsert content từ sheet |
| Scheduler + BullMQ | Hàng đợi job, retry, delay |
| Audit log | Ghi lại mọi thay đổi quan trọng |
| Dashboard | Thống kê posts, success/fail rate |

---

## 3. Out of Scope (V1)

- Facebook Group / Profile
- Instagram, TikTok, YouTube
- AI caption/hashtag
- Multi-tenant SaaS
- MinIO/S3 (dùng Google Drive URL trực tiếp)

---

## 4. Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| Backend API | NestJS, TypeScript, Prisma |
| Database | PostgreSQL 16 |
| Queue | BullMQ + Redis 7 |
| Auth | JWT (access + refresh) |
| Frontend | React, Ant Design, React Query, React Router |
| Infra | Docker Compose, Nginx |

---

## 5. Cấu trúc monorepo đề xuất

```text
tool-auto-fb/
├── docs/                    # Tài liệu (bạn đang đọc)
├── backend/                 # NestJS API + Scheduler
│   ├── prisma/
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── facebook-pages/
│   │   │   ├── content-assets/
│   │   │   ├── google-sheet-sync/
│   │   │   ├── publish-jobs/
│   │   │   ├── audit-logs/
│   │   │   └── dashboard/
│   │   ├── common/          # guards, decorators, filters, interceptors
│   │   └── config/
│   └── test/
├── worker/                  # BullMQ consumer (có thể gộp vào backend)
│   └── src/
│       ├── processors/
│       └── publishers/      # Facebook Graph API client
├── frontend/
│   └── src/
│       ├── pages/
│       ├── components/
│       ├── hooks/
│       ├── api/
│       └── routes/
├── docker/
│   ├── docker-compose.yml
│   └── nginx/
└── .env.example
```

**Quyết định kiến trúc:** Worker là process riêng (`worker/`) ở server, có thể dùng supervisord.
**process riêng** để scale worker độc lập API.

---

## 6. Nguyên tắc coding (bắt buộc)

1. **NestJS Modular** — mỗi domain = 1 module
2. **Repository pattern** — controller không gọi Prisma trực tiếp
3. **DTO + class-validator** — validate mọi input
4. **Swagger** — document tất cả endpoints
5. **RBAC Guards** — không hardcode role string trong controller
6. **Audit interceptor** — log thay đổi quan trọng
7. **Không lưu plaintext token** — encrypt `access_token` Facebook
8. **ConfigModule** — mọi secret qua env

---

## 7. Luồng nghiệp vụ chính

```mermaid
sequenceDiagram
    participant CT as Content Team
    participant GS as Google Sheet
    participant API as NestJS API
    participant DB as PostgreSQL
    participant Q as BullMQ
    participant W as Worker
    participant FB as Meta Graph API

    CT->>GS: Nhập/sửa content, approved=TRUE
    API->>GS: Sync (manual/cron)
    GS-->>API: Rows
    API->>DB: Upsert content_assets

    Note over API,DB: Publisher tạo publish_job
    API->>DB: INSERT publish_jobs (APPROVED)
    API->>Q: add job (delay = scheduled_at)
    API->>DB: status = QUEUED

    Q->>W: dequeue
    W->>DB: status = PUBLISHING
    W->>FB: POST feed/photos/videos
    FB-->>W: post_id
    W->>DB: status = SUCCESS, published_at
```

---

## 8. Biến môi trường cốt lõi

```env
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/social_publish

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

# Google
GOOGLE_SERVICE_ACCOUNT_JSON=  # path hoặc base64
GOOGLE_SHEET_ID=
GOOGLE_SHEET_RANGE=Sheet1!A1:I1000

# Meta
META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v21.0
```

---

## 9. Index tài liệu

| File | Nội dung |
|------|----------|
| [01-business-requirements.md](./01-business-requirements.md) | User stories, acceptance criteria |
| [02-architecture.md](./02-architecture.md) | Kiến trúc chi tiết, module boundaries |
| [03-database-design.md](./03-database-design.md) | Prisma schema, indexes, migrations |
| [04-api-spec.md](./04-api-spec.md) | REST API đầy đủ |
| [05-rbac.md](./05-rbac.md) | Roles, permissions, guards |
| [06-google-sheet-sync.md](./06-google-sheet-sync.md) | Sync flow, mapping, dedup |
| [07-facebook-publisher.md](./07-facebook-publisher.md) | Graph API, media upload |
| [08-bullmq.md](./08-bullmq.md) | Queue, worker, retry |
| [09-deployment.md](./09-deployment.md) | Docker, Nginx, production |
| [10-roadmap.md](./10-roadmap.md) | Sprint plan, task breakdown |

---

## 10. Định nghĩa Done (V1)

- [ ] User login/logout, refresh token
- [ ] CRUD users + gán role (ADMIN)
- [ ] CRUD Facebook pages + token encrypted
- [ ] Sync Google Sheet → content_assets
- [ ] Approve content, tạo publish job, schedule
- [ ] Worker publish image + video lên FB Page
- [ ] Retry failed jobs
- [ ] Dashboard metrics
- [ ] Audit log cho actions quan trọng
- [ ] Docker Compose chạy full stack local
- [ ] Unit tests cho core services
