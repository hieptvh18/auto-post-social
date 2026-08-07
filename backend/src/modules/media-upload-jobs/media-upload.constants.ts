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

/** Một file đang nằm trên đĩa server, chờ đẩy lên Drive. */
export interface MediaUploadFileInfo {
  originalFilename: string;
  mimeType: string;
  size: number;
  /** Đường dẫn tuyệt đối trong `MEDIA_UPLOAD_TMP_DIR`. */
  tempPath: string;
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
}
