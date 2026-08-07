import {
  MediaType,
  MediaUploadSource,
  MediaUploadStatus,
} from '../../../generated/prisma/client';
import {
  ALLOWED_VIDEO_MIMES,
  ALLOWED_IMAGE_MIMES,
} from '../media/media-type.util';
import type { MediaUploadJobRecord } from './media-upload-jobs.repository';

/** Dòng "mờ" trên bảng Quản lý Ảnh/Video trong lúc file còn đang lên Drive. */
export interface MediaUploadJobResponse {
  id: string;
  status: MediaUploadStatus;
  /** `DRIVE_LINK` ⇒ FE hiện "Đang copy từ Drive" thay vì "Đang tải lên". */
  source: MediaUploadSource;
  title: string;
  category: string;
  /** `null` khi mime lạ (không nên xảy ra — đã chặn lúc nhận file). */
  mediaType: MediaType | null;
  originalFilename: string;
  fileCount: number;
  /** Byte — số nên FE không phải xử lý BigInt. */
  totalSize: number;
  errorMessage: string | null;
  attemptCount: number;
  /** Bài đã tạo xong — FE dùng để thay dòng mờ bằng dòng thật. */
  contentAssetId: string | null;
  /** `true` = FAILED và file tạm còn trên đĩa ⇒ bấm "Thử lại" được. */
  canRetry: boolean;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export function toMediaUploadJobResponse(
  job: MediaUploadJobRecord,
): MediaUploadJobResponse {
  return {
    id: job.id,
    status: job.status,
    source: job.source,
    title: job.metadata.title,
    category: job.metadata.category,
    mediaType: detectMediaType(job.files[0]?.mimeType),
    originalFilename: job.originalFilename,
    fileCount: job.fileCount,
    totalSize: Number(job.totalSize),
    errorMessage: job.errorMessage,
    attemptCount: job.attemptCount,
    contentAssetId: job.contentAssetId,
    // Job nhập từ link luôn thử lại được: nguồn nằm trên Drive người khác, không
    // phải file tạm trên đĩa server nên `filesRemovedAt` không nói lên điều gì.
    canRetry:
      job.status === MediaUploadStatus.FAILED &&
      (job.source === MediaUploadSource.DRIVE_LINK ||
        job.filesRemovedAt === null),
    createdBy: { id: job.createdBy.id, name: job.createdBy.name },
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

/** Bản **không ném lỗi** của `resolveMediaType` — mapper không được làm hỏng list. */
function detectMediaType(mimeType: string | undefined): MediaType | null {
  if (mimeType === undefined) return null;
  if ((ALLOWED_IMAGE_MIMES as readonly string[]).includes(mimeType)) {
    return MediaType.image;
  }
  if ((ALLOWED_VIDEO_MIMES as readonly string[]).includes(mimeType)) {
    return MediaType.video;
  }
  return null;
}
