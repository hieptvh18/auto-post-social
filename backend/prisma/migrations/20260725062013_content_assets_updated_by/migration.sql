-- AlterTable
ALTER TABLE "content_assets" ADD COLUMN     "updated_by" UUID;

-- AddForeignKey
ALTER TABLE "content_assets" ADD CONSTRAINT "content_assets_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
