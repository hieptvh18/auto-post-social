import type { Readable } from 'node:stream';

export interface UploadFileInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface DriveFile {
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  webViewLink: string | null;
  thumbnailLink: string | null;
}

/**
 * Metadata một file **bên ngoài** folder của tool (plan 24) — đủ để quyết định
 * có nhập được hay không mà chưa đụng tới byte nào của file.
 */
export interface DriveFileMeta {
  fileId: string;
  name: string;
  mimeType: string;
  /** Drive không trả `size` cho file Google Docs ⇒ null. */
  size: number | null;
  /** `false` = chủ file đã tắt quyền tải/sao chép ⇒ `copy()` chắc chắn 403. */
  canCopy: boolean;
  /** != null ⇒ đây là shortcut, id thật nằm ở đây. */
  shortcutTargetId: string | null;
  /** Link xem file gốc — dùng khi nhập link mà KHÔNG copy về folder tool. */
  webViewLink: string | null;
  /** Ảnh xem trước của file gốc; null khi Drive không sinh thumbnail. */
  thumbnailLink: string | null;
}

/** Cổng ra Google Drive thật (service account hoặc OAuth2). */
export interface DriveStorage {
  upload(file: UploadFileInput): Promise<DriveFile>;
  createReadStream(fileId: string): Promise<Readable>;
  delete(fileId: string): Promise<void>;
  /**
   * Xoá file, coi **404 là thành công** (file đã không còn thì mục tiêu "file
   * không còn tồn tại" đã đạt) — dùng cho cron dọn dẹp reup (plan 30 §3.1 bước
   * 1). Lỗi khác (403/500...) vẫn ném ra để cron KHÔNG đánh dấu đã xoá.
   */
  deleteIfExists(fileId: string): Promise<void>;
  /** Đọc metadata file nguồn (chỉ metadata — không tải nội dung). */
  getMetadata(fileId: string): Promise<DriveFileMeta>;
  /**
   * Copy file **phía server của Google** vào folder đang cấu hình: 1 request,
   * 0 byte đi qua backend (plan 24 §0.1). Không bao giờ được thay bằng
   * download + upload lại.
   */
  copy(fileId: string, name?: string): Promise<DriveFile>;
}
