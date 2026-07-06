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

export function ContentStatusTag({ status }: { status: ContentStatus }) {
  return (
    <Tag color={CONTENT_STATUS_COLORS[status]}>{CONTENT_STATUS_LABELS[status]}</Tag>
  );
}
