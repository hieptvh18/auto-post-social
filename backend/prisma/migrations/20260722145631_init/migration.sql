-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'EDITOR', 'CONTENT');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video');

-- CreateEnum
CREATE TYPE "SlotMediaType" AS ENUM ('image', 'video', 'all');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHING', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "PublishStatus" AS ENUM ('SCHEDULED', 'QUEUED', 'PUBLISHING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CONTENT',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facebook_pages" (
    "id" UUID NOT NULL,
    "page_name" TEXT NOT NULL,
    "page_id" TEXT NOT NULL,
    "access_token_enc" TEXT NOT NULL,
    "token_expire_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "autopost_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_assets" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT,
    "category" TEXT NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "drive_file_id" TEXT NOT NULL,
    "drive_url" TEXT,
    "thumbnail_url" TEXT,
    "mime_type" TEXT,
    "file_size" BIGINT,
    "status" "ContentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "is_ads" BOOLEAN NOT NULL DEFAULT false,
    "reject_comment" TEXT,
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_page_assignments" (
    "id" UUID NOT NULL,
    "content_asset_id" UUID NOT NULL,
    "facebook_page_id" UUID NOT NULL,
    "published_at" TIMESTAMP(3),
    "facebook_post_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_page_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_post_slots" (
    "id" UUID NOT NULL,
    "facebook_page_id" UUID NOT NULL,
    "time" TEXT NOT NULL,
    "categories" TEXT[],
    "media_type" "SlotMediaType" NOT NULL DEFAULT 'all',
    "post_count" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_post_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_runs" (
    "id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "run_date" TEXT NOT NULL,
    "run_time" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slot_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publish_jobs" (
    "id" UUID NOT NULL,
    "content_asset_id" UUID NOT NULL,
    "facebook_page_id" UUID NOT NULL,
    "caption" TEXT NOT NULL,
    "hashtags" TEXT,
    "schedule_time" TIMESTAMP(3) NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'QUEUED',
    "published_at" TIMESTAMP(3),
    "facebook_post_id" TEXT,
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "bull_job_id" TEXT,
    "created_by" TEXT NOT NULL DEFAULT 'Bot',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publish_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "before_value" JSONB,
    "after_value" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_pages_page_id_key" ON "facebook_pages"("page_id");

-- CreateIndex
CREATE INDEX "facebook_pages_is_active_idx" ON "facebook_pages"("is_active");

-- CreateIndex
CREATE INDEX "content_assets_status_idx" ON "content_assets"("status");

-- CreateIndex
CREATE INDEX "content_assets_category_idx" ON "content_assets"("category");

-- CreateIndex
CREATE INDEX "content_assets_media_type_idx" ON "content_assets"("media_type");

-- CreateIndex
CREATE INDEX "content_assets_created_by_idx" ON "content_assets"("created_by");

-- CreateIndex
CREATE INDEX "content_assets_is_ads_idx" ON "content_assets"("is_ads");

-- CreateIndex
CREATE INDEX "content_assets_status_updated_at_idx" ON "content_assets"("status", "updated_at");

-- CreateIndex
CREATE INDEX "content_page_assignments_facebook_page_id_published_at_idx" ON "content_page_assignments"("facebook_page_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "content_page_assignments_content_asset_id_facebook_page_id_key" ON "content_page_assignments"("content_asset_id", "facebook_page_id");

-- CreateIndex
CREATE INDEX "auto_post_slots_facebook_page_id_enabled_idx" ON "auto_post_slots"("facebook_page_id", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "slot_runs_slot_id_run_date_run_time_key" ON "slot_runs"("slot_id", "run_date", "run_time");

-- CreateIndex
CREATE INDEX "publish_jobs_status_idx" ON "publish_jobs"("status");

-- CreateIndex
CREATE INDEX "publish_jobs_schedule_time_idx" ON "publish_jobs"("schedule_time");

-- CreateIndex
CREATE INDEX "publish_jobs_content_asset_id_facebook_page_id_idx" ON "publish_jobs"("content_asset_id", "facebook_page_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "facebook_pages" ADD CONSTRAINT "facebook_pages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_page_assignments" ADD CONSTRAINT "content_page_assignments_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_page_assignments" ADD CONSTRAINT "content_page_assignments_facebook_page_id_fkey" FOREIGN KEY ("facebook_page_id") REFERENCES "facebook_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_post_slots" ADD CONSTRAINT "auto_post_slots_facebook_page_id_fkey" FOREIGN KEY ("facebook_page_id") REFERENCES "facebook_pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_runs" ADD CONSTRAINT "slot_runs_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "auto_post_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_jobs" ADD CONSTRAINT "publish_jobs_facebook_page_id_fkey" FOREIGN KEY ("facebook_page_id") REFERENCES "facebook_pages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
