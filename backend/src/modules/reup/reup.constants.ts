/**
 * Queue thứ tư của dự án (sau `publish-facebook`, `media-upload`,
 * `media-drive-import`) — theo cùng quy ước `docs/08-bullmq.md` §1: tên
 * kebab-case, payload **chỉ chứa id**, worker tự đọc ngữ cảnh từ Postgres.
 */
export const REUP_DOWNLOAD_QUEUE = 'reup-download';

/**
 * Tải video ăn băng thông và đĩa nặng hơn hẳn upload thường ⇒ để 2 là cố ý
 * (plan 29 §3.3). Chạy song song nhiều là tự bắn vào chân: nghẽn mạng của chính
 * chặng đẩy lên Drive đang chạy cùng lúc.
 */
export const REUP_DOWNLOAD_CONCURRENCY = 2;

export const REUP_DOWNLOAD_MAX_ATTEMPTS = 3;
export const REUP_DOWNLOAD_BACKOFF_MS = 60_000;

/**
 * Tên job trong `SchedulerRegistry` (plan 32). Cố định để `rescheduleAll()` tìm
 * lại đúng job cũ mà gỡ — đổi tên giữa chừng là job cũ kẹt lại chạy mãi.
 */
export const REUP_DISCOVERY_CRON_NAME = 'reup-discovery';
export const REUP_CLEANUP_CRON_NAME = 'reup-cleanup';

/** Giờ lưu dạng `'HH:mm'` luôn hiểu theo giờ VN (rule 01 §Thời gian, R6). */
export const REUP_CRON_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Payload job — nguồn sự thật là bảng `reup_videos`. */
export interface ReupDownloadJobData {
  reupVideoId: string;
}

export function buildReupJobOptions(bullJobId: string): {
  jobId: string;
  attempts: number;
  backoff: { type: string; delay: number };
  removeOnComplete: number;
  removeOnFail: number;
} {
  return {
    jobId: bullJobId,
    attempts: REUP_DOWNLOAD_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: REUP_DOWNLOAD_BACKOFF_MS },
    removeOnComplete: 50,
    removeOnFail: 200,
  };
}

/**
 * Quota YouTube tiêu cho MỘT lần `search.list` (đơn vị của Google Data API v3).
 * `videos.list` thêm 1 unit nữa, làm tròn lên cho dễ cộng dồn.
 */
export const YOUTUBE_SEARCH_QUOTA_COST = 101;

/** `{title}` trong `captionTemplate` được thay bằng tiêu đề video gốc. */
export const CAPTION_TITLE_PLACEHOLDER = '{title}';

export function buildReupCaption(
  template: string | null,
  videoTitle: string,
): string {
  if (template === null || template.trim() === '') return videoTitle;
  return template.split(CAPTION_TITLE_PLACEHOLDER).join(videoTitle);
}
