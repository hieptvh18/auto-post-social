import { Tag } from 'antd';
import type { ContentStatus, PublishStatus, UserRole } from '../../types';
import {
  CONTENT_STATUS_COLORS,
  CONTENT_STATUS_LABELS,
  ROLE_COLORS,
  ROLE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from '../../utils/constants';

export function RoleTag({ role }: { role: UserRole }) {
  return <Tag color={ROLE_COLORS[role]}>{ROLE_LABELS[role]}</Tag>;
}

export function StatusTag({ status }: { status: PublishStatus }) {
  return <Tag color={STATUS_COLORS[status]}>{STATUS_LABELS[status]}</Tag>;
}

interface ContentStatusTagProps {
  status: ContentStatus;
  /** Số page đã đăng thành công — hiện badge x/y khi Đang đăng/Đã đăng */
  publishedCount?: number;
  /** Số page được phân bổ */
  assignedCount?: number;
}

export function ContentStatusTag({
  status,
  publishedCount,
  assignedCount,
}: ContentStatusTagProps) {
  const showProgress =
    (status === 'PUBLISHING' || status === 'PUBLISHED') &&
    publishedCount !== undefined &&
    assignedCount !== undefined &&
    assignedCount > 0;

  return (
    <Tag color={CONTENT_STATUS_COLORS[status]}>
      {CONTENT_STATUS_LABELS[status]}
      {showProgress ? ` · ${publishedCount}/${assignedCount} page` : ''}
    </Tag>
  );
}
