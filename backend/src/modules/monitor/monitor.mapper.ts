import type { PublishStatus } from '../../../generated/prisma/client';
import {
  toPublishJobResponse,
  type PublishJobResponse,
} from '../publish-jobs/publish-job.mapper';
import type { QueueCounts, QueueSummary } from './monitor.service';

export interface StuckJobResponse {
  id: string;
  contentTitle: string;
  pageName: string;
  status: PublishStatus;
  stuckMinutes: number;
  updatedAt: string;
}

export interface QueueSummaryResponse {
  queue: QueueCounts | null;
  queueHealthy: boolean;
  queueError: string | null;
  db: Record<PublishStatus, number>;
  stuck: StuckJobResponse[];
  stuckThresholdMinutes: number;
  activeJobs: PublishJobResponse[];
  checkedAt: string;
}

export function toQueueSummaryResponse(
  summary: QueueSummary,
): QueueSummaryResponse {
  return {
    queue: summary.queue,
    queueHealthy: summary.queueHealthy,
    queueError: summary.queueError,
    db: summary.db,
    stuck: summary.stuck.map((job) => ({
      id: job.id,
      contentTitle: job.contentTitle,
      pageName: job.pageName,
      status: job.status,
      stuckMinutes: job.stuckMinutes,
      updatedAt: job.updatedAt.toISOString(),
    })),
    stuckThresholdMinutes: summary.stuckThresholdMinutes,
    activeJobs: summary.activeJobs.map(toPublishJobResponse),
    checkedAt: summary.checkedAt.toISOString(),
  };
}
