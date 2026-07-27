-- CreateEnum
CREATE TYPE "FacebookConnectMode" AS ENUM ('MANUAL_TOKEN', 'FB_LOGIN');

-- AlterTable
ALTER TABLE "facebook_pages" ADD COLUMN     "connect_mode" "FacebookConnectMode" NOT NULL DEFAULT 'MANUAL_TOKEN',
ADD COLUMN     "connection_id" UUID;

-- CreateTable
CREATE TABLE "facebook_connections" (
    "id" UUID NOT NULL,
    "fb_user_id" TEXT NOT NULL,
    "fb_user_name" TEXT,
    "user_token_enc" TEXT,
    "token_expire_at" TIMESTAMP(3),
    "scopes" TEXT[],
    "revoked_at" TIMESTAMP(3),
    "connected_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facebook_connections_fb_user_id_key" ON "facebook_connections"("fb_user_id");

-- CreateIndex
CREATE INDEX "facebook_connections_revoked_at_idx" ON "facebook_connections"("revoked_at");

-- CreateIndex
CREATE INDEX "facebook_pages_connection_id_idx" ON "facebook_pages"("connection_id");

-- AddForeignKey
ALTER TABLE "facebook_connections" ADD CONSTRAINT "facebook_connections_connected_by_fkey" FOREIGN KEY ("connected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facebook_pages" ADD CONSTRAINT "facebook_pages_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "facebook_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
