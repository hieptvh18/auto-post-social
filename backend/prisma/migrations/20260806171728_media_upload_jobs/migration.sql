-- CreateEnum
CREATE TYPE "MediaUploadStatus" AS ENUM ('QUEUED', 'UPLOADING_TO_DRIVE', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "media_upload_jobs" (
    "id" UUID NOT NULL,
    "status" "MediaUploadStatus" NOT NULL DEFAULT 'QUEUED',
    "original_filename" TEXT NOT NULL,
    "file_count" INTEGER NOT NULL,
    "total_size" BIGINT NOT NULL,
    "files" JSONB NOT NULL,
    "metadata" JSONB NOT NULL,
    "error_message" TEXT,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "bull_job_id" TEXT,
    "files_removed_at" TIMESTAMP(3),
    "content_asset_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_upload_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_upload_jobs_status_idx" ON "media_upload_jobs"("status");

-- CreateIndex
CREATE INDEX "media_upload_jobs_created_by_status_idx" ON "media_upload_jobs"("created_by", "status");

-- AddForeignKey
ALTER TABLE "media_upload_jobs" ADD CONSTRAINT "media_upload_jobs_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_upload_jobs" ADD CONSTRAINT "media_upload_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
