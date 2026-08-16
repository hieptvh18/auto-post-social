import type {
  PublishJobEvent,
  PublishJobEventType,
  PublishStatus,
} from '../../../generated/prisma/client';
import type { JobWithContext } from './publish-jobs.repository';

export interface PublishJobResponse {
  id: string;
  status: PublishStatus;
  contentAssetId: string;
  contentTitle: string;
  pageId: string;
  pageName: string;
  caption: string;
  hashtags: string | null;
  scheduleTime: string;
  publishedAt: string | null;
  facebookPostId: string | null;
  errorMessage: string | null;
  attemptCount: number;
  createdBy: string;
  createdAt: string;
  /** != null = cron dọn dẹp đã xoá file Drive của bài này (plan 30). */
  resourceDeletedAt: string | null;
}

export interface PublishJobEventResponse {
  id: string;
  attemptNo: number;
  event: PublishJobEventType;
  message: string | null;
  rawError: unknown;
  createdAt: string;
}

export function toPublishJobResponse(job: JobWithContext): PublishJobResponse {
  return {
    id: job.id,
    status: job.status,
    contentAssetId: job.contentAssetId,
    contentTitle: job.contentAsset.title,
    pageId: job.facebookPageId,
    pageName: job.facebookPage.pageName,
    caption: job.caption,
    hashtags: job.hashtags,
    scheduleTime: job.scheduleTime.toISOString(),
    publishedAt: job.publishedAt?.toISOString() ?? null,
    facebookPostId: job.facebookPostId,
    errorMessage: job.errorMessage,
    attemptCount: job.attemptCount,
    createdBy: job.createdBy,
    createdAt: job.createdAt.toISOString(),
    resourceDeletedAt:
      job.contentAsset.resourceDeletedAt?.toISOString() ?? null,
  };
}

export function toPublishJobEventResponse(
  event: PublishJobEvent,
): PublishJobEventResponse {
  return {
    id: event.id,
    attemptNo: event.attemptNo,
    event: event.event,
    message: event.message,
    rawError: event.rawError,
    createdAt: event.createdAt.toISOString(),
  };
}
