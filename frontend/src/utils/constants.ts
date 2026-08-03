import type {
  ContentStatus,
  PublishStatus,
  SlotMediaType,
  SlotProgress,
  UserRole,
} from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Quản trị viên',
  EDITOR: 'Editor',
  CONTENT: 'Content',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: 'red',
  EDITOR: 'gold',
  CONTENT: 'blue',
};

export const STATUS_LABELS: Record<PublishStatus, string> = {
  SCHEDULED: 'Đã lên lịch',
  QUEUED: 'Chờ đăng',
  PUBLISHING: 'Đang đăng',
  SUCCESS: 'Thành công',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
};

export const STATUS_COLORS: Record<PublishStatus, string> = {
  SCHEDULED: 'blue',
  QUEUED: 'processing',
  PUBLISHING: 'warning',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELLED: 'default',
};

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  PENDING_REVIEW: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Không duyệt',
  PUBLISHING: 'Đang đăng',
  PUBLISHED: 'Đã đăng',
};

export const CONTENT_STATUS_COLORS: Record<ContentStatus, string> = {
  PENDING_REVIEW: 'processing',
  APPROVED: 'cyan',
  REJECTED: 'error',
  PUBLISHING: 'warning',
  PUBLISHED: 'success',
};

export const MEDIA_TYPE_LABELS = {
  image: 'Ảnh',
  video: 'Video',
} as const;

export const SLOT_MEDIA_TYPE_LABELS: Record<SlotMediaType, string> = {
  image: 'Ảnh',
  video: 'Video',
  all: 'Ảnh + Video',
};

/** Nhãn tiến độ một mốc giờ ở màn "Lịch đăng bài" (backend `SlotProgress`). */
export const SLOT_PROGRESS_LABELS: Record<SlotProgress, string> = {
  PENDING: 'Chờ tới giờ',
  RUNNING: 'Đang đăng',
  DONE: 'Đã đăng đủ',
  PARTIAL: 'Đăng thiếu',
  FAILED: 'Lỗi',
  MISSED: 'Không chạy',
  NO_CONTENT: 'Hết bài trong kho',
  PAUSED: 'Đang tắt',
};

export const SLOT_PROGRESS_COLORS: Record<SlotProgress, string> = {
  PENDING: 'blue',
  RUNNING: 'processing',
  DONE: 'success',
  PARTIAL: 'gold',
  FAILED: 'error',
  MISSED: 'volcano',
  NO_CONTENT: 'orange',
  PAUSED: 'default',
};

export const BOT_PUBLISHER = 'Bot';

export const APP_NAME = 'Auto Planning Tool';
export const APP_TAGLINE = 'Trung tâm Điều trị Cơ Xương Khớp';

/** Email hiển thị trên 3 trang pháp lý công khai — Meta reviewer dùng để liên hệ. */
export const LEGAL_CONTACT_EMAIL = 'hiephoangtran002@gmail.com';
/** Ngày hiệu lực của Privacy / Terms / Data Deletion. Sửa tay khi đổi nội dung. */
export const LEGAL_UPDATED_AT = '03/08/2026';

export const PREVIEW_EMAILS: Record<UserRole, string> = {
  ADMIN: 'admin@phucan-cxk.vn',
  EDITOR: 'editor@phucan-cxk.vn',
  CONTENT: 'content@phucan-cxk.vn',
};

export const CONTENT_CATEGORIES = [
  'Cơ xương khớp',
  'Thăm khám',
  'Khuyến mãi',
  'Giáo dục sức khỏe',
  'Câu chuyện bệnh nhân',
  'Sự kiện',
] as const;
