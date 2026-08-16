/**
 * Lỗi domain của cầu nối downloader (plan 28 §3.2).
 *
 * Mọi lỗi ở đây **phải** là class riêng, không gộp thành một lỗi chung có `code`:
 * plan 29 cần phân biệt chúng bằng `instanceof` để chọn `skip_reason` đúng, và
 * "chưa cài downloader" với "downloader chạy nhưng video hỏng" đòi hai hành động
 * hoàn toàn khác nhau (§3.3b).
 */

/** Gốc chung — để module reup bắt trọn bằng một `catch` khi cần. */
export abstract class ReupDownloaderError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Downloader **không dùng được**: thiếu env, sai đường dẫn, chưa cài Python,
 * spawn ENOENT. Đây là trạng thái **bình thường** của một máy chưa cài
 * `ai-video-downloader` (QĐ-6) ⇒ log 1 dòng WARN, KHÔNG stack trace, KHÔNG 500.
 *
 * Tách hẳn khỏi `DownloadFailedError`: gộp chung thì không phân biệt được
 * "chưa cài" với "cài rồi nhưng video hỏng".
 */
export class DownloaderUnavailableError extends ReupDownloaderError {
  constructor(reason: string) {
    super(`Downloader không dùng được: ${reason}`);
  }
}

/** Python trả `contractVersion` khác thứ backend hiểu (§3.3c). */
export class DownloaderContractMismatchError extends ReupDownloaderError {
  constructor(
    readonly expected: number,
    readonly received: unknown,
  ) {
    super(
      `Hợp đồng downloader lệch phiên bản: backend hiểu v${expected}, downloader trả v${String(
        received,
      )}. Cập nhật một trong hai bên, KHÔNG parse tiếp.`,
    );
  }
}

/** stdout không phải JSON hợp lệ — thường do log lọt vào stdout (cạm bẫy C4). */
export class DownloaderParseError extends ReupDownloaderError {
  constructor(rawOutput: string) {
    super(
      `Không đọc được JSON từ downloader (stdout có lẫn log?). ` +
        `stdout: ${truncate(rawOutput, 300)}`,
    );
  }
}

/** Chưa cấu hình API key YouTube ở `/settings` — plan 29 dịch thành NOT_CONFIGURED. */
export class YoutubeNotConfiguredError extends ReupDownloaderError {
  constructor() {
    super(
      'Chưa cấu hình API key YouTube. Vào Cài đặt chung → YouTube API để nhập.',
    );
  }
}

/** Hết quota Data API v3 trong ngày (search.list = 100 units, trần 10.000). */
export class YoutubeQuotaExceededError extends ReupDownloaderError {
  constructor(message: string) {
    super(`Hết quota YouTube API: ${message}`);
  }
}

/** Key sai / bị khoá / chặn theo IP-referer. Người vận hành phải sửa key. */
export class YoutubeInvalidApiKeyError extends ReupDownloaderError {
  constructor(message: string) {
    super(`API key YouTube không hợp lệ: ${message}`);
  }
}

/** Video bị gỡ/để riêng tư — retry vô nghĩa, phải bỏ qua video đó. */
export class ReupVideoUnavailableError extends ReupDownloaderError {
  constructor(message: string) {
    super(`Video không còn khả dụng: ${message}`);
  }
}

/** Tải hỏng vì lý do tạm thời (mạng, 403 throttle của YouTube) — retry được. */
export class DownloadFailedError extends ReupDownloaderError {
  constructor(message: string) {
    super(`Tải video thất bại: ${message}`);
  }
}

/** Quá hạn giờ — process con đã bị giết cùng cả cây con. */
export class DownloaderTimeoutError extends ReupDownloaderError {
  constructor(timeoutMs: number) {
    super(`Downloader quá ${timeoutMs}ms chưa xong — đã dừng tiến trình`);
  }
}

/**
 * `errorCode` trong hợp đồng JSON là **tập đóng** (plan 28 §3.1). Map theo MÃ,
 * tuyệt đối không parse chuỗi `message` — chuỗi sẽ đổi, mã thì không.
 */
export function toDomainError(
  errorCode: string,
  message: string,
): ReupDownloaderError {
  switch (errorCode) {
    case 'QUOTA_EXCEEDED':
      return new YoutubeQuotaExceededError(message);
    case 'INVALID_API_KEY':
      return new YoutubeInvalidApiKeyError(message);
    case 'VIDEO_UNAVAILABLE':
      return new ReupVideoUnavailableError(message);
    case 'TIMEOUT':
      return new DownloadFailedError(`Downloader báo timeout: ${message}`);
    case 'DOWNLOAD_FAILED':
    case 'UNKNOWN':
    default:
      return new DownloadFailedError(message);
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}…`;
}
