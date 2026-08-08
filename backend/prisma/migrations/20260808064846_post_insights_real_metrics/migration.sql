/*
  Warnings:

  - You are about to drop the column `impressions` on the `post_insight_snapshots` table. All the data in the column will be lost.
  - You are about to drop the column `impressions_unique` on the `post_insight_snapshots` table. All the data in the column will be lost.
  - You are about to drop the column `impressions` on the `post_insights` table. All the data in the column will be lost.
  - You are about to drop the column `impressions_unique` on the `post_insights` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "post_insight_snapshots" DROP COLUMN "impressions",
DROP COLUMN "impressions_unique",
ADD COLUMN     "clicks" INTEGER,
ADD COLUMN     "fan_reach" INTEGER;

-- AlterTable
ALTER TABLE "post_insights" DROP COLUMN "impressions",
DROP COLUMN "impressions_unique",
ADD COLUMN     "clicks" INTEGER,
ADD COLUMN     "fan_reach" INTEGER,
ALTER COLUMN "like_count" DROP NOT NULL,
ALTER COLUMN "like_count" DROP DEFAULT,
ALTER COLUMN "comment_count" DROP NOT NULL,
ALTER COLUMN "comment_count" DROP DEFAULT,
ALTER COLUMN "share_count" DROP NOT NULL,
ALTER COLUMN "share_count" DROP DEFAULT,
ALTER COLUMN "fetched_at" DROP NOT NULL;
