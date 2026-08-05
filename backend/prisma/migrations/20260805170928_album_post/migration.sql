-- AlterTable
ALTER TABLE "auto_post_slots" ADD COLUMN     "assets_per_post" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "publish_job_assets" (
    "id" UUID NOT NULL,
    "publish_job_id" UUID NOT NULL,
    "content_asset_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "publish_job_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publish_job_assets_content_asset_id_idx" ON "publish_job_assets"("content_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_job_assets_publish_job_id_content_asset_id_key" ON "publish_job_assets"("publish_job_id", "content_asset_id");

-- CreateIndex
CREATE UNIQUE INDEX "publish_job_assets_publish_job_id_position_key" ON "publish_job_assets"("publish_job_id", "position");

-- AddForeignKey
ALTER TABLE "publish_job_assets" ADD CONSTRAINT "publish_job_assets_publish_job_id_fkey" FOREIGN KEY ("publish_job_id") REFERENCES "publish_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publish_job_assets" ADD CONSTRAINT "publish_job_assets_content_asset_id_fkey" FOREIGN KEY ("content_asset_id") REFERENCES "content_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
