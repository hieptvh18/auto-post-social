# Plan 01 — Scaffold backend, Docker, Prisma, env

**Milestone:** M0
**Trạng thái:** ✅
**Phụ thuộc:** —
**Spec:** `docs/00-overview.md` §5 §8, `docs/03-database-design.md`

---

## 1. Mục tiêu

Có backend NestJS chạy được, kết nối Postgres + Redis qua Docker, schema Prisma đã
migrate, seed sẵn admin, bộ khung test + coverage threshold hoạt động.

## 2. Ngoài phạm vi

Chưa có module nghiệp vụ nào. Chưa Nginx, chưa production compose.

## 3. Thiết kế

```text
backend/
├── prisma/schema.prisma, seed.ts
├── src/
│   ├── main.ts, app.module.ts
│   ├── config/            # env.validation.ts, app/db/redis/drive/meta config
│   ├── common/            # filters, interceptors, decorators, guards, utils
│   ├── infra/prisma/      # prisma.module.ts, prisma.service.ts (global)
│   └── modules/health/
├── jest.config.ts, .env, .env.example
docker/docker-compose.yml   # postgres:16, redis:7
```

Schema Prisma copy nguyên từ `docs/03` §3, **bổ sung** bảng chống double-fire:

```prisma
model SlotRun {
  id        String   @id @default(uuid()) @db.Uuid
  slotId    String   @map("slot_id") @db.Uuid
  runDate   String   @map("run_date")   // 'YYYY-MM-DD' theo Asia/Ho_Chi_Minh
  runTime   String   @map("run_time")   // 'HH:mm'
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([slotId, runDate, runTime])
  @@map("slot_runs")
}
```

## 4. Task

- [x] `nest new backend` (npm, TypeScript strict)
- [x] Cài: `@nestjs/config @nestjs/swagger @nestjs/jwt @nestjs/passport passport-jwt
      @nestjs/schedule @nestjs/bullmq bullmq ioredis @prisma/client prisma
      class-validator class-transformer bcrypt nestjs-pino pino-http dayjs`
- [x] `docker/docker-compose.yml`: postgres 16 (volume), redis 7 + `docker/.env.example`
- [x] `prisma/schema.prisma` theo `docs/03` §3 + model `SlotRun`
- [x] Cập nhật `erd.md` (điền migration `init`, kiểm số bảng khớp schema) — rule 05
- [x] `prisma migrate dev --name init` → verify bảng sinh đúng
- [x] `prisma/seed.ts`: admin `admin@company.local` / `ChangeMe123!` (bcrypt 12)
- [x] `PrismaService` global module (`onModuleInit` connect, shutdown hook)
- [x] `src/config/env.validation.ts` — validate lúc boot, thiếu biến ⇒ crash
- [x] `.env` + `.env.example` (backend) theo `docs/00` §8 + `DRIVE_DRIVER`,
      `FACEBOOK_DRIVER`, `TZ_DISPLAY`
- [x] `main.ts`: global `ValidationPipe({whitelist, forbidNonWhitelisted, transform})`,
      prefix `api`, Swagger `/api/docs`
- [ ] **Pino + redact secret — CHƯA LÀM**, còn dùng Nest Logger mặc định.
      Đã cài `nestjs-pino`/`pino-http`. Chuyển sang M1 (xem contexts.md §6)
- [x] `HttpExceptionFilter` trả đúng format `docs/04` §12
- [x] `HealthModule`: `GET /health`, `GET /health/ready` (ping DB + Redis)
- [x] `jest.config.ts` + coverage threshold 100% & ignore patterns theo rule 02
- [x] Scripts: `lint`, `test`, `test:cov`, `build`, `prisma:migrate`, `seed`
- [x] `.gitignore`: `.env`, `dist`, `node_modules`
- [x] Unit test: env validation, health service, exception filter — 100%
- [x] `npm run lint && npm run test:cov && npm run build` xanh
- [x] Cập nhật `contexts.md`

## 5. Điều kiện nghiệm thu

- [x] `docker compose up -d` → postgres + redis healthy
- [x] `npm run start:dev` → `GET /api/health/ready` trả 200 với `db: ok, redis: ok`
- [x] `/api/docs` mở được
- [x] Xóa 1 biến env bắt buộc ⇒ app crash kèm message rõ ràng
- [x] `npm run test:cov` xanh, threshold 100% có hiệu lực

## 6. Rủi ro

| Rủi ro | Cách xử lý |
|--------|-----------|
| Prisma enum `MediaType` giá trị lowercase (`image`/`video`) | Giữ đúng docs, không tự đổi sang UPPER |
| Threshold 100% chặn ngay từ đầu | Ignore pattern đúng theo rule 02 trước khi viết code nghiệp vụ |

---

## 7. Kết quả

- **Ngày xong:** 2026-07-22
- **File chính:**
  - `backend/prisma/schema.prisma`, `backend/prisma.config.ts`, `backend/prisma/seed.ts`
  - `backend/src/config/env.validation.ts`, `app-config.service.ts`
  - `backend/src/infra/prisma/prisma.service.ts`, `backend/src/infra/redis/redis.service.ts`
  - `backend/src/common/filters/http-exception.filter.ts`
  - `backend/src/common/middleware/correlation-id.middleware.ts`
  - `backend/src/modules/health/*`, `backend/jest.config.ts`
  - `docker/docker-compose.yml`
- **Khác thiết kế ban đầu:**
  1. **Prisma 7** (không phải 5/6): `url` không còn đặt trong `schema.prisma` mà ở
     `prisma.config.ts`; runtime client phải dùng driver adapter `@prisma/adapter-pg`.
     Client sinh ra `backend/generated/prisma` (gitignored).
  2. **Port lệch chuẩn**: máy dev đã có Postgres 5432, Redis 6379, app 3000 chiếm chỗ.
     Dùng 55432 / 56379 / 3100.
  3. **`tsconfig.spec.json` riêng cho test**: tắt `emitDecoratorMetadata` khi chạy
     jest. TypeScript sinh helper `__metadata("design:paramtypes")` cho mỗi constructor
     có decorator, trong đó có nhánh ternary mà test không thể chạm tới ⇒ branch
     coverage không bao giờ đạt 100%. Build thật vẫn giữ metadata cho Nest DI.
  4. **`tsconfig.build.json` giới hạn `include: ["src/**/*"]`** để `dist/main.js` nằm
     đúng chỗ (nếu không, `prisma/` bị kéo vào làm dịch thành `dist/src/main.js`).
- **Test:** 65 test / 8 suite · coverage 100% statements·branches·functions·lines
- **Còn nợ:** Pino logger + redact secret (chuyển sang M1)
