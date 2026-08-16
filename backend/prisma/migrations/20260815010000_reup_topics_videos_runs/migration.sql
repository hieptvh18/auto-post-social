-- Plan 27 — nền dữ liệu reup: 4 enum + 3 bảng mới + 2 cột trên content_assets.
-- HOÀN TOÀN ADDITIVE: không DROP, không đổi kiểu, mọi cột mới đều nullable hoặc
-- có DEFAULT ⇒ dữ liệu cũ giữ nguyên hành vi, không cần backfill (plan 27 §6 R2).
-- Gộp sẵn 3 thứ của plan 29 (reup_runs.quota_used, media_upload_jobs.reup_video_id,
-- MediaUploadSource.REUP) để không phải ALTER TYPE thêm lần nữa — xem ISSUES-TO-REVIEW I6.

-- CreateEnum
CREATE TYPE "ContentSource" AS ENUM ('MANUAL', 'REUP');

-- CreateEnum
CREATE TYPE "ReupPlatform" AS ENUM ('YOUTUBE', 'DOUYIN', 'TIKTOK');

-- CreateEnum
CREATE TYPE "ReupVideoStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'DOWNLOADED', 'UPLOADING', 'IMPORTED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ReupRunStatus" AS ENUM ('CLAIMED', 'DONE', 'SKIPPED', 'ERROR');

-- AlterEnum
ALTER TYPE "MediaUploadSource" ADD VALUE 'REUP';

-- AlterTable
ALTER TABLE "content_assets" ADD COLUMN     "resource_deleted_at" TIMESTAMP(3),
ADD COLUMN     "source_type" "ContentSource" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "media_upload_jobs" ADD COLUMN     "reup_video_id" UUID;

-- CreateTable
CREATE TABLE "reup_topics" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "ReupPlatform" NOT NULL DEFAULT 'YOUTUBE',
    "keywords" TEXT[],
    "region_code" TEXT NOT NULL DEFAULT 'VN',
    "category" TEXT NOT NULL,
    "daily_quota" INTEGER NOT NULL DEFAULT 3,
    "min_view_count" INTEGER NOT NULL DEFAULT 50000,
    "max_age_days" INTEGER NOT NULL DEFAULT 30,
    "min_duration_sec" INTEGER NOT NULL DEFAULT 15,
    "max_duration_sec" INTEGER NOT NULL DEFAULT 180,
    "auto_approve" BOOLEAN NOT NULL DEFAULT false,
    "caption_template" TEXT,
    "hashtags" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reup_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reup_videos" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "platform" "ReupPlatform" NOT NULL,
    "external_id" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "view_count" BIGINT,
    "thumbnail_url" TEXT,
    "status" "ReupVideoStatus" NOT NULL DEFAULT 'PENDING',
    "local_path" TEXT,
    "file_size" BIGINT,
    "content_asset_id" UUID,
    "media_upload_job_id" UUID,
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reup_videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reup_runs" (
    "id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "run_date" TEXT NOT NULL,
    "status" "ReupRunStatus" NOT NULL DEFAULT 'CLAIMED',
    "found_count" INTEGER NOT NULL DEFAULT 0,
    "picked_count" INTEGER NOT NULL DEFAULT 0,
    "quota_used" INTEGER NOT NULL DEFAULT 0,
    "skip_reason" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "reup_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reup_topics_is_active_idx" ON "reup_topics"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "reup_topics_name_platform_key" ON "reup_topics"("name", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "reup_videos_content_asset_id_key" ON "reup_videos"("content_asset_id");

-- CreateIndex
CREATE INDEX "reup_videos_status_idx" ON "reup_videos"("status");

-- CreateIndex
CREATE INDEX "reup_videos_topic_id_discovered_at_idx" ON "reup_videos"("topic_id", "discovered_at");

-- CreateIndex
CREATE UNIQUE INDEX "reup_videos_platform_external_id_key" ON "reup_videos"("platform", "external_id");

-- CreateIndex
CREATE INDEX "reup_runs_run_date_status_idx" ON "reup_runs"("run_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reup_runs_topic_id_run_date_key" ON "reup_runs"("topic_id", "run_date");

-- CreateIndex
CREATE INDEX "content_assets_source_type_idx" ON "content_assets"("source_type");

-- CreateIndex
CREATE INDEX "media_upload_jobs_reup_video_id_idx" ON "media_upload_jobs"("reup_video_id");

-- AddForeignKey
ALTER TABLE "reup_topics" ADD CONSTRAINT "reup_topics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reup_videos" ADD CONSTRAINT "reup_videos_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "reup_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reup_videos" ADD CONSTRAINT "reup_videos_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reup_runs" ADD CONSTRAINT "reup_runs_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "reup_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

