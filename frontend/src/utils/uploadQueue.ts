import type { CreateMediaUploadJobBody } from '../types';

/**
 * Số file được đẩy lên **server** song song. Uplink nhà/văn phòng thường hẹp:
 * chạy 5 file cùng lúc không nhanh hơn chạy 2, chỉ khiến file nào cũng bò.
 */
export const MAX_PARALLEL_LOCAL_UPLOADS = 2;

/**
 * Một lượt "Upload" đang ở chặng **trình duyệt → server** (plan 24b).
 *
 * Chặng này không thể chạy ở backend: byte nằm trên máy người dùng. Thứ làm
 * được là **không chặn giao diện** trong lúc nó chạy — nên nó có vòng đời riêng
 * ở client, trước khi `media_upload_jobs` phía server tồn tại.
 */
export interface LocalUpload {
  /** Id phía client — chưa có id server nào ở giai đoạn này. */
  id: string;
  status: LocalUploadStatus;
  /** % byte đã đẩy lên server (tiến độ THẬT từ XHR, không phải ước lượng). */
  percent: number;
  title: string;
  category: string;
  filename: string;
  fileCount: number;
  totalSize: number;
  errorMessage?: string;
  createdAt: string;
  /** Giữ lại để "Thử lại" không bắt chọn lại file. */
  body: CreateMediaUploadJobBody;
}

export type LocalUploadStatus =
  /** Đang xếp hàng, chưa tới lượt (đã đủ `MAX_PARALLEL_LOCAL_UPLOADS`). */
  | 'PENDING'
  | 'SENDING'
  | 'FAILED';

/**
 * Chọn những lượt được phép chạy tiếp, giữ đúng trần song song.
 *
 * Hàm **thuần** để test được cái dễ sai nhất của hàng đợi: đếm đúng số đang
 * chạy và giữ đúng thứ tự xếp hàng.
 */
export function pickNextPending(
  uploads: LocalUpload[],
  maxParallel: number,
): string[] {
  const running = uploads.filter((item) => item.status === 'SENDING').length;
  const slots = maxParallel - running;
  if (slots <= 0) return [];

  return uploads
    .filter((item) => item.status === 'PENDING')
    .slice(0, slots)
    .map((item) => item.id);
}

/** Có còn byte đang đi lên server không — dùng để cảnh báo trước khi rời trang. */
export function hasUnfinishedUpload(uploads: LocalUpload[]): boolean {
  return uploads.some(
    (item) => item.status === 'SENDING' || item.status === 'PENDING',
  );
}
