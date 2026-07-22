import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7: connection URL cho Migrate/Studio khai báo ở đây (không còn trong schema.prisma).
// Runtime client dùng PrismaPg adapter — xem src/infra/prisma/prisma.service.ts
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
