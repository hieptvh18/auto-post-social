-- Plan 26: role SUPER_ADMIN đứng trên ADMIN.
-- ALTER TYPE ... ADD VALUE phải đứng MỘT MÌNH trong migration: ở nhiều phiên bản
-- Postgres nó không chạy được bên trong transaction cùng DDL khác (plan 26 §6 R4).
ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN' BEFORE 'ADMIN';
