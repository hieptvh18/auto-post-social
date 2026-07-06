import type { PublishStatus, UserRole } from '../types';

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Quản trị viên',
  CONTENT: 'Content',
  PUBLISHER: 'Publisher',
  VIEWER: 'Xem only',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: 'red',
  CONTENT: 'blue',
  PUBLISHER: 'green',
  VIEWER: 'default',
};

export const STATUS_LABELS: Record<PublishStatus, string> = {
  DRAFT: 'Nháp',
  APPROVED: 'Đã duyệt',
  QUEUED: 'Chờ đăng',
  PUBLISHING: 'Đang đăng',
  SUCCESS: 'Thành công',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã hủy',
};

export const STATUS_COLORS: Record<PublishStatus, string> = {
  DRAFT: 'default',
  APPROVED: 'cyan',
  QUEUED: 'processing',
  PUBLISHING: 'warning',
  SUCCESS: 'success',
  FAILED: 'error',
  CANCELLED: 'default',
};

export const MEDIA_TYPE_LABELS = {
  image: 'Ảnh',
  video: 'Video',
} as const;
