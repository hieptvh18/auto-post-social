# 00 — Overview

> Social Content Workflow Management Platform — Tài liệu tổng quan triển khai coding

**Version:** v2.0  
**Tham chiếu:** [Plan.md](../Plan.md)

---

## 1. Tóm tắt dự án

Nền tảng nội bộ quản lý quy trình Content và tự động đăng bài lên **Facebook Page**.

```text
Content User → Web Admin (upload + workflow)
Reviewer → Web Admin (approve/reject)
Publisher → Web Admin (schedule)
         ↓
    PostgreSQL (source of truth)
         ↓
Google Drive API (media storage) + BullMQ Worker → Meta Graph API → Facebook Pages
```

**Google Sheet bị loại bỏ hoàn toàn.** Web Admin là cổng làm việc duy nhất.

---

## 2. Mục tiêu V1

| Mục tiêu | Mô tả |
|----------|--------|
| Content workflow | DRAFT → Review → APPROVED → Schedule → Publish |
| Upload media | Upload ảnh/video qua Web Admin → Google Drive |
| Web Admin | Content Library, Review Center, Publisher Center |
| RBAC | 4 role: ADMIN, CONTENT, REVIEWER, PUBLISHER |
| Scheduler + BullMQ | Hàng đợi job, delay, retry, DLQ |
| Audit log | Ghi lại mọi thay đổi quan trọng |
| Dashboard | Thống kê content, publish, top creators |

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
| Queue | BullMQ + Redis 7 |
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
│       │   ├── roles/
│       │   ├── facebook-pages/
│       │   ├── content-assets/
│       │   ├── reviews/           # Review Center
│       │   ├── comments/
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
│       │   ├── ContentLibrary/
│       │   ├── ReviewCenter/
│       │   ├── PublisherCenter/
│       │   └── ...
│       ├── components/
│       ├── hooks/
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
5. **RBAC Guards** — permission-based, không hardcode role trong controller
6. **Audit interceptor** — log thay đổi quan trọng
7. **Không lưu plaintext token** — encrypt `access_token` Facebook
8. **Không lưu media trên server** — stream từ Google Drive khi publish
9. **ConfigModule** — mọi secret qua env

---

## 7. Luồng nghiệp vụ chính

```mermaid
sequenceDiagram
    participant CU as Content User
    participant API as NestJS API
    participant GD as Google Drive
    participant DB as PostgreSQL
    participant RV as Reviewer
    participant PB as Publisher
    participant Q as BullMQ
    participant W as Worker
    participant FB as Meta Graph API

    CU->>API: Tạo content + upload media
    API->>GD: Upload file
    GD-->>API: fileId
    API->>DB: content_assets (DRAFT)

    CU->>API: Submit review
    API->>DB: status = WAITING_APPROVAL

    RV->>API: Approve / Reject + comment
    API->>DB: status = APPROVED / REJECTED

    PB->>API: Setup caption, page, schedule
    API->>DB: publish_jobs (SCHEDULED)
    API->>Q: add job (delay)

    Q->>W: dequeue at schedule time
    W->>DB: status = PUBLISHING
    W->>GD: Stream download
    W->>FB: POST photos/videos
    FB-->>W: post_id
    W->>DB: status = SUCCESS
```

---

## 8. Biến môi trường cốt lõi

```env
# App
NODE_ENV=development
PORT=3000
API_PREFIX=api

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/social_workflow

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
| [02-architecture.md](./02-architecture.md) | Kiến trúc chi tiết, module boundaries |
| [03-database-design.md](./03-database-design.md) | Prisma schema, indexes, migrations |
| [04-api-spec.md](./04-api-spec.md) | REST API đầy đủ |
| [05-rbac.md](./05-rbac.md) | Roles, permissions, guards |
| [06-google-drive.md](./06-google-drive.md) | Upload, stream, thumbnail |
| [07-facebook-publisher.md](./07-facebook-publisher.md) | Graph API, media upload |
| [08-bullmq.md](./08-bullmq.md) | Queue, worker, retry, DLQ |
| [09-deployment.md](./09-deployment.md) | Docker, Nginx, production |
| [10-roadmap.md](./10-roadmap.md) | Sprint plan, task breakdown |

---

## 10. Định nghĩa Done (V1)

- [ ] User login/logout, refresh token
- [ ] CRUD users + gán role (ADMIN)
- [ ] CRUD Facebook pages + token encrypted
- [ ] Upload media → Google Drive, lưu metadata DB
- [ ] Content workflow: DRAFT → WAITING_APPROVAL → APPROVED/REJECTED
- [ ] Review Center: approve, reject, comment
- [ ] Publisher schedule bài APPROVED lên FB Page
- [ ] Worker stream publish image + video (không lưu file server)
- [ ] Retry failed jobs + DLQ monitor
- [ ] Dashboard metrics
- [ ] Audit log cho actions quan trọng
- [ ] Docker Compose chạy full stack local
- [ ] Unit tests cho core services
