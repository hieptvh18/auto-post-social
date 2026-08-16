/**
 * Cổng ra tới `ai-video-downloader` (plan 28, QĐ-1).
 *
 * **Ranh giới cứng (QĐ-6 §3):** KHÔNG module nào ngoài `modules/reup` được import
 * file này. Kho nội dung, auto-post, publish, dashboard, audit đều không biết
 * downloader tồn tại — đó là thứ giữ cho reup thật sự là phụ thuộc tuỳ chọn.
 *
 * Hôm nay chỉ có một implementation là spawn process con. Đổi sang HTTP service
 * sau này chỉ phải viết adapter khác — interface này, hợp đồng JSON và tập
 * `errorCode` giữ nguyên (đường nâng cấp ghi ở plan 28 §3.6).
 */

/** Phiên bản hợp đồng JSON mà backend hiểu. Lệch ⇒ dừng, không parse tiếp. */
export const REUP_CONTRACT_VERSION = 1;

export interface ReupSearchParams {
  keyword: string;
  maxResults: number;
  regionCode: string;
  /** Chỉ lấy video đăng trong N ngày gần đây. */
  publishedAfterDays: number;
}

/** Một video ứng viên — chưa tải, chưa lưu DB. */
export interface ReupVideoCandidate {
  externalId: string;
  title: string;
  authorName: string;
  sourceUrl: string;
  /** ISO 8601 hoặc null nếu nguồn không trả. */
  publishedAt: string | null;
  /**
   * `null` = **không đo được**, không phải 0. Bộ lọc `minViewCount`/duration phải
   * xử lý null tường minh — coi null là 0 sẽ loại nhầm video của kênh tắt hiện
   * lượt xem (cùng bài học `null ≠ 0` của plan 25).
   */
  durationSec: number | null;
  viewCount: number | null;
  thumbnailUrl: string | null;
}

export interface DownloadedFile {
  filePath: string;
  fileSize: number;
  mimeType: string;
}

export interface DownloaderAvailability {
  available: boolean;
  /** Lý do không dùng được — chỉ có khi `available = false`. */
  reason?: string;
  version?: string;
}

export interface ReupDownloaderPort {
  search(params: ReupSearchParams): Promise<ReupVideoCandidate[]>;

  /** `outDir` phải TUYỆT ĐỐI và DUY NHẤT theo job (cạm bẫy C5). */
  download(params: { url: string; outDir: string }): Promise<DownloadedFile>;

  /**
   * Downloader có dùng được không. **KHÔNG BAO GIỜ ném lỗi** — luôn trả kết quả,
   * kể cả khi chưa cài gì. Dùng cho banner `/reup` và `GET /reup/health`, nơi mà
   * "chưa cài" là một câu trả lời hợp lệ chứ không phải sự cố.
   */
  checkAvailability(): Promise<DownloaderAvailability>;
}

/** DI token — `ReupDownloaderPort` là interface nên không dùng làm token được. */
export const REUP_DOWNLOADER = Symbol('REUP_DOWNLOADER');
