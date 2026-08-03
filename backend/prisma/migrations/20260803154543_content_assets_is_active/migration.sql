-- DropIndex
DROP INDEX "content_assets_status_updated_at_idx";

-- AlterTable
ALTER TABLE "content_assets" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "content_assets_is_active_idx" ON "content_assets"("is_active");

-- CreateIndex
CREATE INDEX "content_assets_status_is_active_updated_at_idx" ON "content_assets"("status", "is_active", "updated_at");
