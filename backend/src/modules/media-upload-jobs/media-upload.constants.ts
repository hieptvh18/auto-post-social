/**
 * Queue thứ hai của dự án (sau `publish-facebook`), theo cùng quy ước ở
 * `docs/08-bullmq.md` §1: tên kebab-case, payload chỉ chứa **id**, worker tự
 * đọc ngữ cảnh từ Postgres — không nhét file/metadata vào Redis.
 */
export const MEDIA_UPLOAD_QUEUE = 'media-upload';

/** Số lần thử tối đa cho một job upload (cùng mức với publish job). */
export const MEDIA_UPLOAD_MAX_ATTEMPTS = 3;

/** Giãn cách retry ban đầu (ms) — nhân đôi theo backoff mũ. */
export const MEDIA_UPLOAD_BACKOFF_MS = 30_000;

/** Payload job — nguồn sự thật là bảng `media_upload_jobs`. */
export interface MediaUploadJobData {
  mediaUploadJobId: string;
}

/**
 * Option BullMQ dùng chung cho cả hai queue media (upload từ máy · nhập từ
 * link): giữ một chỗ để retry/backoff không lệch nhau giữa hai luồng.
 */
export function buildMediaJobOptions(bullJobId: string): {
  jobId: string;
  attempts: number;
  backoff: { type: string; delay: number };
  removeOnComplete: number;
  removeOnFail: number;
} {
  return {
    jobId: bullJobId,
    attempts: MEDIA_UPLOAD_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: MEDIA_UPLOAD_BACKOFF_MS },
    removeOnComplete: 100,
    removeOnFail: 500,
  };
}

/**
 * Queue thứ ba (plan 24): copy file từ Drive khác về folder của tool.
 *
 * Tách khỏi `media-upload` **có chủ đích**: một video 500MB đang chiếm hết
 * `MEDIA_UPLOAD_CONCURRENCY` slot sẽ chặn đầu hàng đợi (head-of-line) hàng chục
 * lệnh copy vốn chỉ mất vài giây — hai loại việc không được giành slot của nhau.
 */
export const DRIVE_IMPORT_QUEUE = 'media-drive-import';

/** Một file của job. Nguồn ở đĩa server (plan 23) **hoặc** ở Drive (plan 24). */
export interface MediaUploadFileInfo {
  originalFilename: string;
  mimeType: string;
  size: number;
  /**
   * Đường dẫn tuyệt đối trong `MEDIA_UPLOAD_TMP_DIR`. Chỉ có với
   * `source = LOCAL_FILE`; job nhập từ link không ghi gì xuống đĩa.
   */
  tempPath?: string;
  /**
   * fileId **gốc** bên Drive người khác. Chỉ có với `source = DRIVE_LINK` —
   * worker gọi `files.copy` trên id này, không tải nội dung về.
   */
  sourceFileId?: string;
  /**
   * Link xem file **gốc**. Chỉ dùng ở chế độ nhập link không copy — bài trỏ
   * thẳng vào file của người ta nên `drive_url` phải là link gốc.
   */
  sourceWebViewLink?: string;
  /** Thumbnail của file gốc, cũng chỉ dùng ở chế độ không copy. */
  sourceThumbnailLink?: string;
}

/** Form lúc submit — worker dựng lại `content_assets` từ đúng bộ field này. */
export interface MediaUploadMetadata {
  title: string;
  description?: string;
  category: string;
  caption: string;
  hashtags?: string;
  assignedPageIds: string[];
  editorId?: string;
  /**
   * Plan 24 §0.3-1: caption bỏ trống ⇒ bài phải vào `PENDING_REVIEW` **kể cả**
   * khi người nhập là ADMIN. Caption `'-'` là chỗ giữ chỗ, không phải nội dung
   * đăng được — để nó tự APPROVED thì Bot có thể đăng bài "-" lên Page thật.
   */
  forceReview?: boolean;
  /**
   * Chỉ có với `source = DRIVE_LINK` (yêu cầu user 2026-08-08).
   *
   * `true` = copy file về folder Drive của tool như cũ (tool sở hữu bản sao).
   * `false`/bỏ trống = **chỉ lưu link**: bài trỏ thẳng vào file gốc, không tốn
   * dung lượng Drive cá nhân đang cấu hình. Đánh đổi: người ta bỏ chia sẻ hoặc
   * xoá file gốc thì bài không đăng được nữa.
   */
  copyToDrive?: boolean;
}

/** Caption placeholder khi user không nhập — cột DB là NOT NULL. */
export const EMPTY_CAPTION_PLACEHOLDER = '-';

/**
 * Danh mục mặc định cho bài nhập từ link (plan 24). Modal chỉ có ô dán link nên
 * không hỏi danh mục — bài vào kho ở trạng thái Chờ duyệt, người dùng đặt danh
 * mục thật lúc duyệt. **Hệ quả cần biết:** Bot chỉ lấy bài theo danh mục của mốc
 * giờ, nên bài giữ nguyên danh mục này sẽ không được đăng tự động.
 */
export const DEFAULT_IMPORT_CATEGORY = 'Chưa phân loại';
