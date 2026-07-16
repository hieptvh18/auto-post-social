# Tool Auto FB — Luca

**Version:** 3.0 (mô hình Auto-Post)  
**Tài liệu chi tiết:** [docs/00-overview.md](./docs/00-overview.md)

---

## Tóm tắt

Nền tảng quản lý content nội bộ + **tự động đăng bài lên Facebook Page bằng Bot** —
thay thế hoàn toàn Google Sheet bằng **Web Admin**. Media lưu trên **Google Drive**;
metadata và workflow lưu trên **PostgreSQL**.

Điểm khác biệt v3.0: **1 trang quản lý duy nhất** (như file sheet Excel) chứa mọi
thông tin + thao tác duyệt; việc đăng bài do **Bot cron** chạy theo
**Cài đặt đăng bài tự động** đã config sẵn cho từng page — không còn thao tác lên
lịch từng bài.

| Vai trò | Workspace |
|---------|-----------|
| Content | Quản lý Ảnh/Video Edit — upload, sửa bài của mình, caption, phân bổ page |
| Editor (Leader) | Quản lý Ảnh/Video Edit (duyệt, Đạt ADS) + Cài đặt đăng tự động + Timeline |
| Admin | Toàn quyền — users, pages, monitor (queue/failed/audit) |
| Bot (hệ thống) | Tự động đăng bài theo lịch config |

---

## 6 menu chính (+ Monitor)

1. **Tổng quan (Dashboard)** — thống kê theo khoảng ngày/tháng/năm: video đạt ADS,
   bài đăng theo từng page (filter video/ảnh), các widget hiện có
2. **Quản lý Ảnh/Video Edit** — bộ lọc (range ngày cập nhật, người upload, dạng,
   trạng thái, search); table: No, Ngày upload, Trạng thái (Chờ duyệt/Đã duyệt/
   Không duyệt/Đang đăng/Đã đăng), Dạng, Link, Phân bổ page (nhiều page),
   Ngày cập nhật; edit qua drawer (kèm Đạt ADS, caption, hashtags); xoá.
   **Không còn nút Gửi duyệt** — follow duyệt nằm trọn trong trang này
3. **Timeline (Lịch đăng bài)** — timeline theo giờ, filter Kênh/Trạng thái/
   Người đăng (cố định Bot), link bài FB + media Drive
4. **Cài đặt đăng bài tự động** — per FB Page: các mốc giờ trong ngày, mỗi mốc chọn
   dạng bài + loại media + số bài; config 1 lần dùng suốt vòng đời
5. **Quản lý FB Pages** — CRUD pages + token
6. **Quản lý nhân sự** — CRUD users, 3 role

Monitor (ADMIN): Queue Monitor · Failed Jobs · Audit Logs

---

## Kiến trúc tổng quan

```text
                    Web Admin (6 menu)
                          │
                          ▼
                    PostgreSQL  ◀── Cài đặt đăng bài tự động (slots per page)
                          │
                          ▼
              Cron Scheduler (Bot, mỗi phút)
      pick bài Đã duyệt: đúng dạng/media, unique 1 lần/page,
              order updated_at ASC (duyệt sớm đăng trước)
                          │
                          ▼
                  BullMQ Worker
                          │
        Google Drive (stream) → Meta Graph API → Facebook Pages
```

Chi tiết: [docs/02-architecture.md](./docs/02-architecture.md)

---

## Content Lifecycle

```text
(upload) → PENDING_REVIEW (Chờ duyệt)
              ↓ duyệt                    ↓ không duyệt (+lý do)
           APPROVED (Đã duyệt)        REJECTED → sửa → PENDING_REVIEW
              ↓ Bot lấy theo slot
           PUBLISHING (Đang đăng)
              ↓ thành công ≥ 1 page
           PUBLISHED (Đã đăng — badge x/y page)
```

Chi tiết workflow: [docs/01-business-requirements.md](./docs/01-business-requirements.md)

---

## Nguyên tắc phát triển

| Nguyên tắc | Giá trị |
|------------|---------|
| Single Source of Truth | PostgreSQL |
| Single Working Portal | Web Admin (1 trang quản lý content duy nhất) |
| Media Storage | Google Drive (chỉ `fileId`, không lưu file trên server) |
| Auto Publishing | Cron Bot + BullMQ + Redis — unique content × page |
| Authentication | JWT |
| Authorization | RBAC (ADMIN / EDITOR / CONTENT) |
| Audit | Mọi action quan trọng phải log (kể cả Bot) |
| Architecture | Clean Architecture, DDD-lite, feature-first module |

---

## Tech Stack

| Layer | Công nghệ |
|-------|-----------|
| Backend | NestJS, Prisma, PostgreSQL, BullMQ, Redis, @nestjs/schedule, Pino, Swagger |
| Integrations | Google Drive API, Meta Graph API |
| Frontend | React, Ant Design, React Query |
| Infra | Docker Compose, Nginx — 2 vCPU, 4GB RAM, 50GB SSD |

---

## Index tài liệu (`docs/`)

| File | Nội dung |
|------|----------|
| [00-overview.md](./docs/00-overview.md) | Tổng quan, monorepo, env, definition of done |
| [01-business-requirements.md](./docs/01-business-requirements.md) | Pain points, roles, workflow, FR/NFR, user stories |
| [02-architecture.md](./docs/02-architecture.md) | System context, cron scheduler, modules, request flows |
| [03-database-design.md](./docs/03-database-design.md) | ERD, Prisma schema, assignments/slots, picker query |
| [04-api-spec.md](./docs/04-api-spec.md) | REST API đầy đủ |
| [05-rbac.md](./docs/05-rbac.md) | 3 role, permissions, route guards |
| [06-google-drive.md](./docs/06-google-drive.md) | Upload media, stream publish |
| [07-facebook-publisher.md](./docs/07-facebook-publisher.md) | Meta Graph API, image/video publish |
| [08-bullmq.md](./docs/08-bullmq.md) | Cron auto-post, queue, retry, DLQ |
| [09-deployment.md](./docs/09-deployment.md) | Docker Compose, Nginx, production |
| [10-roadmap.md](./docs/10-roadmap.md) | Sprint plan, task breakdown |

---

## Future Features (V2+)

Campaign · Content Calendar · Multi-platform (Instagram, TikTok, YouTube) ·
AI Caption/Hashtag · Multi-level approval · Notifications (Email, Telegram, Slack)

Chi tiết: [docs/10-roadmap.md](./docs/10-roadmap.md#phase-2--future)
