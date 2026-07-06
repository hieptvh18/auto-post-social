import type { ContentStatus, PublishStatus, UserRole } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Quản trị viên',
  CONTENT: 'Content',
  REVIEWER: 'Reviewer',
  PUBLISHER: 'Publisher',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: 'red',
  CONTENT: 'blue',
  REVIEWER: 'gold',
  PUBLISHER: 'green',
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
  DRAFT: 'Nháp',
  WAITING_APPROVAL: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
};

export const CONTENT_STATUS_COLORS: Record<ContentStatus, string> = {
  DRAFT: 'default',
  WAITING_APPROVAL: 'processing',
  APPROVED: 'success',
  REJECTED: 'error',
};

export const MEDIA_TYPE_LABELS = {
  image: 'Ảnh',
  video: 'Video',
} as const;

export const APP_NAME = 'Luca';
export const APP_TAGLINE = 'Trung tâm Điều trị Cơ Xương Khớp';

export const PREVIEW_EMAILS: Record<UserRole, string> = {
  ADMIN: 'admin@phucan-cxk.vn',
  CONTENT: 'content@phucan-cxk.vn',
  REVIEWER: 'reviewer@phucan-cxk.vn',
  PUBLISHER: 'publisher@phucan-cxk.vn',
};

export const CONTENT_CATEGORIES = [
  'Giáo dục sức khỏe',
  'Dịch vụ điều trị',
  'Khuyến mãi',
  'Câu chuyện bệnh nhân',
  'Sự kiện',
  'Tư vấn chuyên môn',
] as const;
