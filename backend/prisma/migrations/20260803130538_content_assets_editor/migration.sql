-- AlterTable
ALTER TABLE "content_assets" ADD COLUMN     "editor_id" UUID;

-- CreateIndex
CREATE INDEX "content_assets_editor_id_idx" ON "content_assets"("editor_id");

-- AddForeignKey
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_editor_id_fkey" FOREIGN KEY ("editor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
