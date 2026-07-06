# Social Content Workflow Management Platform

**Version:** 2.0  
**Tài liệu chi tiết:** [docs/00-overview.md](./docs/00-overview.md)

---

## Tóm tắt

Nền tảng quản lý quy trình Content nội bộ — thay thế hoàn toàn Google Sheet bằng **Web Admin** làm cổng làm việc duy nhất. Media lưu trên **Google Drive**; metadata và workflow lưu trên **PostgreSQL**.

| Vai trò | Workspace |
|---------|-----------|
| Content User | Content Library — upload, tạo, sửa, submit review |
| Reviewer (Leader) | Review Center — approve, reject, comment |
| Publisher | Publisher Center — schedule, caption, hashtag, retry |
| Admin | Toàn quyền — users, pages, queue, audit |

---

## Kiến trúc tổng quan

```text
                    Web Admin
        ┌──────────────┬───────────────┐
        ▼                              ▼
 Content Workspace             Publish Workspace
        │                              │
        └──────────────┬───────────────┘
                       ▼
                 PostgreSQL
                       ▼
                Google Drive API → Google Drive (media only)
                       ▼
                  BullMQ Worker
                       ▼
               Meta Graph API → Facebook Pages
```

Chi tiết: [docs/02-architecture.md](./docs/02-architecture.md)

---

## Content Lifecycle

```text
DRAFT → WAITING_APPROVAL → APPROVED → SCHEDULED → PUBLISHING → SUCCESS
                              ↓                              ↓
                          REJECTED                         FAILED → RETRY
```

Chi tiết workflow: [docs/01-business-requirements.md](./docs/01-business-requirements.md#4-workflow)

---

## Nguyên tắc phát triển

| Nguyên tắc | Giá trị |
|------------|---------|
| Single Source of Truth | PostgreSQL |
| Single Working Portal | Web Admin |
| Media Storage | Google Drive (chỉ `fileId`, không lưu file trên server) |
| Background Processing | BullMQ + Redis |
| Authentication | JWT |
| Authorization | RBAC |
| Audit | Mọi action quan trọng phải log |
| Architecture | Clean Architecture, DDD-lite, feature-first module |

---

## Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| Backend | NestJS, Prisma, PostgreSQL, BullMQ, Redis, Pino, Swagger |
| Integrations | Google Drive API, Meta Graph API |
| Frontend | React, Ant Design, React Query |
| Infra | Docker Compose, Nginx — 2 vCPU, 4GB RAM, 50GB SSD |

---

## Web Admin Modules

Authentication · Dashboard · User/Role/Permission Management · Content Library · Review Center · Publisher Center · Schedule Calendar · Facebook Pages · Queue Monitor · Failed Jobs · Audit Logs · System Settings

Chi tiết UI/FR: [docs/01-business-requirements.md](./docs/01-business-requirements.md)

---

## Index tài liệu (`docs/`)

| File | Nội dung |
|------|----------|
| [00-overview.md](./docs/00-overview.md) | Tổng quan, monorepo, env, definition of done |
| [01-business-requirements.md](./docs/01-business-requirements.md) | Pain points, roles, workflow, FR/NFR, user stories |
| [02-architecture.md](./docs/02-architecture.md) | System context, modules, request flows |
| [03-database-design.md](./docs/03-database-design.md) | ERD, Prisma schema, indexes, migrations |
| [04-api-spec.md](./docs/04-api-spec.md) | REST API đầy đủ |
| [05-rbac.md](./docs/05-rbac.md) | Roles, permissions, route guards |
| [06-google-drive.md](./docs/06-google-drive.md) | Upload media, stream publish |
| [07-facebook-publisher.md](./docs/07-facebook-publisher.md) | Meta Graph API, image/video publish |
| [08-bullmq.md](./docs/08-bullmq.md) | Queue `publish-facebook`, retry, DLQ |
| [09-deployment.md](./docs/09-deployment.md) | Docker Compose, Nginx, production |
| [10-roadmap.md](./docs/10-roadmap.md) | Sprint plan, task breakdown |

---

## Future Features (V2+)

Campaign · Content Calendar · Multi-platform (Instagram, TikTok, YouTube) · AI Caption/Hashtag/SEO · Multi-level approval · Notifications (Email, Telegram, Slack)

Chi tiết: [docs/10-roadmap.md](./docs/10-roadmap.md#phase-2--future)
