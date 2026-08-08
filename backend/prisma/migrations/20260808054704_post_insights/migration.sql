-- CreateTable
CREATE TABLE "post_insights" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "facebook_post_id" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "impressions_unique" INTEGER NOT NULL DEFAULT 0,
    "video_views" INTEGER,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "share_count" INTEGER NOT NULL DEFAULT 0,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "missing_on_fb_at" TIMESTAMP(3),
    "sync_error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_insight_snapshots" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "snapshot_date" TEXT NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "impressions_unique" INTEGER NOT NULL DEFAULT 0,
    "video_views" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_insight_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_insights_assignment_id_key" ON "post_insights"("assignment_id");

-- CreateIndex
CREATE INDEX "post_insights_facebook_post_id_idx" ON "post_insights"("facebook_post_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_insight_snapshots_assignment_id_snapshot_date_key" ON "post_insight_snapshots"("assignment_id", "snapshot_date");

-- AddForeignKey
ALTER TABLE "post_insights" ADD CONSTRAINT "post_insights_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "content_page_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_insight_snapshots" ADD CONSTRAINT "post_insight_snapshots_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "content_page_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
