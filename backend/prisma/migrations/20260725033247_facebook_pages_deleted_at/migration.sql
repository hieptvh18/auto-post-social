-- AlterTable
ALTER TABLE "facebook_pages" ADD COLUMN     "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "facebook_pages_deleted_at_idx" ON "facebook_pages"("deleted_at");
