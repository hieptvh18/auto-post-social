import type { ContentStatus, PublishStatus, SlotMediaType, UserRole } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Quản trị viên',
  EDITOR: 'Biên tập / Duyệt bài',
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

export const BOT_PUBLISHER = 'Bot';

export const APP_NAME = 'Luca';
export const APP_TAGLINE = 'Trung tâm Điều trị Cơ Xương Khớp';

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
