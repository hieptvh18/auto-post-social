-- DropForeignKey
ALTER TABLE "publish_job_assets" DROP CONSTRAINT "publish_job_assets_content_asset_id_fkey";

-- DropForeignKey
ALTER TABLE "publish_job_assets" DROP CONSTRAINT "publish_job_assets_publish_job_id_fkey";

-- AlterTable
ALTER TABLE "auto_post_slots" DROP COLUMN "assets_per_post";

-- DropTable
DROP TABLE "publish_job_assets";

-- CreateTable
CREATE TABLE "content_asset_files" (
    "id" UUID NOT NULL,
    "content_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "drive_file_id" TEXT NOT NULL,
    "drive_url" TEXT,
    "thumbnail_url" TEXT,
    "mime_type" TEXT,
    "file_size" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_asset_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_asset_files_content_asset_id_idx" ON "content_asset_files"("content_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_asset_files_content_asset_id_position_key" ON "content_asset_files"("content_asset_id", "position");

-- AddForeignKey
ALTER TABLE "content_asset_files" ADD CONSTRAINT "content_asset_files_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

