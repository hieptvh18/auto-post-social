-- CreateEnum
CREATE TYPE "MediaUploadSource" AS ENUM ('LOCAL_FILE', 'DRIVE_LINK');

-- AlterEnum
ALTER TYPE "MediaUploadStatus" ADD VALUE 'COPYING_FROM_DRIVE';

-- AlterTable
ALTER TABLE "content_assets" ADD COLUMN     "source_drive_file_id" TEXT;

-- AlterTable
ALTER TABLE "media_upload_jobs" ADD COLUMN     "source" "MediaUploadSource" NOT NULL DEFAULT 'LOCAL_FILE';

-- CreateIndex
CREATE INDEX "content_assets_source_drive_file_id_idx" ON "content_assets"("source_drive_file_id");

-- CreateIndex
CREATE INDEX "media_upload_jobs_source_status_idx" ON "media_upload_jobs"("source", "status");
