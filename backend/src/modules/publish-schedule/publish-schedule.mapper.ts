import type {
  MediaType,
  PublishStatus,
  SlotMediaType,
} from '../../../generated/prisma/client';
import type { ScheduleJobRow } from './publish-schedule.repository';
import type { SlotProgress } from './schedule-progress';

/** Người đăng mặc định của job do engine tự động tạo (`publish_jobs.created_by`). */
export const BOT_PUBLISHER = 'Bot';

export interface ScheduleJobResponse {
  id: string;
  contentAssetId: string;
  contentTitle: string;
  category: string;
  mediaType: MediaType;
  driveUrl: string | null;
  thumbnailUrl: string | null;
  caption: string;
  hashtags: string | null;
  status: PublishStatus;
  scheduleTime: Date;
  publishedAt: Date | null;
  facebookPostId: string | null;
  errorMessage: string | null;
  attemptCount: number;
  /** Tên người đăng — `'Bot'` nếu do engine tự động, còn lại là tên user đăng tay. */
  publishedBy: string;
  isManual: boolean;
}

export interface ScheduleItemResponse {
  /** Khoá ổn định cho UI: `slot:<id>` hoặc `manual:<pageId>:<HH:mm>`. */
  key: string;
  kind: 'slot' | 'manual';
  time: string;
  slotId: string | null;
  pageId: string;
  facebookPageId: string;
  pageName: string;
  pageIsActive: boolean;
  autopostEnabled: boolean;
  slotEnabled: boolean;
  categories: string[];
  mediaType: SlotMediaType | null;
  /** Số bài kế hoạch: `postCount` với slot, số job thực tế với item đăng tay. */
  plannedCount: number;
  successCount: number;
  failedCount: number;
  runningCount: number;
  /** Bài trong kho còn dùng được cho mốc này — `null` với item đăng tay. */
  readyCount: number | null;
  progress: SlotProgress;
  /** Danh sách người đăng thực tế của các job trong mốc này (không trùng lặp). */
  publishers: string[];
  jobs: ScheduleJobResponse[];
}

export interface PublishScheduleSummary {
  plannedPosts: number;
  activeSlots: number;
  pagesAutoOn: number;
  successPosts: number;
  failedPosts: number;
  runningPosts: number;
  manualPosts: number;
}

export interface PublishScheduleResponse {
  date: string;
  timezone: string;
  summary: PublishScheduleSummary;
  items: ScheduleItemResponse[];
}

export function toScheduleJobResponse(
  row: ScheduleJobRow,
): ScheduleJobResponse {
  return {
    id: row.id,
    contentAssetId: row.contentAssetId,
    contentTitle: row.contentAsset.title,
    category: row.contentAsset.category,
    mediaType: row.contentAsset.mediaType,
    driveUrl: row.contentAsset.driveUrl,
    thumbnailUrl: row.contentAsset.thumbnailUrl,
    caption: row.caption,
    hashtags: row.hashtags,
    status: row.status,
    scheduleTime: row.scheduleTime,
    publishedAt: row.publishedAt,
    facebookPostId: row.facebookPostId,
    errorMessage: row.errorMessage,
    attemptCount: row.attemptCount,
    publishedBy: row.createdBy,
    isManual: row.createdBy !== BOT_PUBLISHER,
  };
}
