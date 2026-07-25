import type {
  AuditLogItem,
  Paginated,
  QueryAuditLogsParams,
} from '../types';
import { apiRequest } from './client';
import { toQueryString } from './queryString';

export const auditApi = {
  /** GET /audit-logs — lịch sử thao tác, phân trang server-side (ADMIN). */
  list(params: QueryAuditLogsParams = {}): Promise<Paginated<AuditLogItem>> {
    return apiRequest<Paginated<AuditLogItem>>(
      `/audit-logs${toQueryString(params)}`,
    );
  },

  /** GET /audit-logs/actions — action thực sự có trong DB, để đổ select. */
  actions(): Promise<string[]> {
    return apiRequest<string[]>('/audit-logs/actions');
  },
};
