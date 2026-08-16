/** Loại nguồn của một bài trong kho (plan 27, QĐ-4). */
export type ContentSource = 'MANUAL' | 'REUP';

/** Giá trị bộ lọc "Loại" ở màn Quản lý Ảnh/Video. `ALL` chỉ tồn tại ở tầng query. */
export type SourceTypeFilter = ContentSource | 'ALL';

export type ReupPlatform = 'YOUTUBE' | 'DOUYIN' | 'TIKTOK';

export type ReupVideoStatus =
  | 'PENDING'
  | 'DOWNLOADING'
  | 'DOWNLOADED'
  | 'UPLOADING'
  | 'IMPORTED'
  | 'FAILED'
  | 'SKIPPED';

export type ReupRunStatus = 'CLAIMED' | 'DONE' | 'SKIPPED' | 'ERROR';

export interface ReupTopicResponse {
  id: string;
  name: string;
  platform: ReupPlatform;
  keywords: string[];
  regionCode: string;
  category: string;
  dailyQuota: number;
  minViewCount: number;
  maxAgeDays: number;
  minDurationSec: number;
  maxDurationSec: number;
  autoApprove: boolean;
  captionTemplate: string | null;
  hashtags: string | null;
  isActive: boolean;
  /** `false` = khai báo được nhưng cron sẽ bỏ qua (QĐ-2 — chỉ YouTube chạy thật). */
  isPlatformSupported: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedReupTopics {
  data: ReupTopicResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface QueryReupTopicsParams {
  platform?: ReupPlatform;
  isActive?: boolean;
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateReupTopicBody {
  name: string;
  platform?: ReupPlatform;
  keywords?: string[];
  regionCode?: string;
  category: string;
  dailyQuota?: number;
  minViewCount?: number;
  maxAgeDays?: number;
  minDurationSec?: number;
  maxDurationSec?: number;
  autoApprove?: boolean;
  captionTemplate?: string;
  hashtags?: string;
  isActive?: boolean;
}

export type UpdateReupTopicBody = Partial<CreateReupTopicBody>;

export interface ReupVideoResponse {
  id: string;
  topicId: string;
  topicName: string;
  platform: ReupPlatform;
  externalId: string;
  sourceUrl: string;
  title: string;
  authorName: string;
  publishedAt: string | null;
  durationSec: number | null;
  viewCount: number | null;
  thumbnailUrl: string | null;
  status: ReupVideoStatus;
  fileSize: number | null;
  contentAssetId: string | null;
  /** != null = cron dọn dẹp đã xoá file Drive của bài này (plan 30). */
  resourceDeletedAt: string | null;
  errorMessage: string | null;
  attemptCount: number;
  discoveredAt: string;
}

export interface PaginatedReupVideos {
  data: ReupVideoResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface QueryReupVideosParams {
  topicId?: string;
  status?: ReupVideoStatus;
  page?: number;
  limit?: number;
}

export interface ReupRunResponse {
  id: string;
  topicId: string;
  topic: { id: string; name: string };
  runDate: string;
  status: ReupRunStatus;
  foundCount: number;
  pickedCount: number;
  quotaUsed: number;
  skipReason: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface PaginatedReupRuns {
  data: ReupRunResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ReupDiscoveryResult {
  topicId: string;
  status: ReupRunStatus;
  foundCount: number;
  pickedCount: number;
  skipReason: string | null;
  claimed: boolean;
}

export interface ReupHealthResponse {
  available: boolean;
  reason?: string;
  version?: string;
}

export interface YoutubeApiSettingsResponse {
  hasApiKey: boolean;
  maskedApiKey: string | null;
  dailyQuota: number;
  usingEnvFallback: boolean;
  updatedAt: string | null;
}

export interface UpdateYoutubeApiSettingsBody {
  apiKey?: string | null;
  dailyQuota?: number;
}

/** Plan 30 — cấu hình cron dọn dẹp video reup đã đăng. */
export interface ReupCleanupSettingsResponse {
  enabled: boolean;
  retentionDays: number;
  updatedAt: string | null;
}

export interface UpdateReupCleanupSettingsBody {
  enabled: boolean;
  retentionDays: number;
}

/** Một bài sẽ bị (hoặc đã bị) xoá file trong lượt dọn dẹp. */
export interface ReupCleanupCandidate {
  id: string;
  title: string;
  driveFileId: string;
  fileSize: number | null;
  publishedAt: string;
}

export interface ReupCleanupPreview {
  enabled: boolean;
  retentionDays: number;
  items: ReupCleanupCandidate[];
  totalBytes: number;
}

export interface ReupCleanupRunResult {
  deletedCount: number;
  freedBytes: number;
  failedCount: number;
}

/** Plan 32 — lịch chạy cron reup, đổi được từ UI, có hiệu lực ngay. */
export interface ReupScheduleSettingsResponse {
  discoveryEnabled: boolean;
  /** 'HH:mm' theo Asia/Ho_Chi_Minh. */
  discoveryTime: string;
  cleanupEnabled: boolean;
  cleanupTime: string;
  /** null = cron đang tắt. */
  discoveryNextRunAt: string | null;
  cleanupNextRunAt: string | null;
  updatedAt: string | null;
}

export interface UpdateReupScheduleBody {
  discoveryEnabled: boolean;
  discoveryTime: string;
  cleanupEnabled: boolean;
  cleanupTime: string;
}
