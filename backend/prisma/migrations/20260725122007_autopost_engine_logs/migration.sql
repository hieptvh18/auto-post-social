-- CreateEnum
CREATE TYPE "SlotRunStatus" AS ENUM ('CLAIMED', 'DONE', 'SKIPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "PublishJobEventType" AS ENUM ('ENQUEUED', 'STARTED', 'SUCCEEDED', 'FAILED', 'RETRY_SCHEDULED', 'GAVE_UP');

-- AlterTable
ALTER TABLE "slot_runs" ADD COLUMN     "error_message" TEXT,
ADD COLUMN     "finished_at" TIMESTAMP(3),
ADD COLUMN     "job_created_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "picked_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "skip_reason" TEXT,
ADD COLUMN     "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" "SlotRunStatus" NOT NULL DEFAULT 'CLAIMED';

-- CreateTable
CREATE TABLE "publish_job_events" (
    "id" UUID NOT NULL,
    "publish_job_id" UUID NOT NULL,
    "attempt_no" INTEGER NOT NULL,
    "event" "PublishJobEventType" NOT NULL,
    "message" TEXT,
    "raw_error" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publish_job_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "publish_job_events_publish_job_id_created_at_idx" ON "publish_job_events"("publish_job_id", "created_at");

-- CreateIndex
CREATE INDEX "slot_runs_run_date_status_idx" ON "slot_runs"("run_date", "status");

-- AddForeignKey
ALTER TABLE "publish_job_events" ADD CONSTRAINT "publish_job_events_publish_job_id_fkey" FOREIGN KEY ("publish_job_id") REFERENCES "publish_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
