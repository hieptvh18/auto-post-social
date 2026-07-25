import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { auditApi } from '../api/audit.api';
import type {
  AuditLogItem,
  Paginated,
  QueryAuditLogsParams,
} from '../types';

const AUDIT_KEY = 'audit-logs';

export function useAuditLogs(
  params: QueryAuditLogsParams,
  enabled = true,
): UseQueryResult<Paginated<AuditLogItem>> {
  return useQuery({
    queryKey: [AUDIT_KEY, params],
    queryFn: () => auditApi.list(params),
    enabled,
  });
}

/** Danh sách action có thật trong DB — không hardcode lại enum ở FE. */
export function useAuditActions(enabled = true): UseQueryResult<string[]> {
  return useQuery({
    queryKey: [AUDIT_KEY, 'actions'],
    queryFn: () => auditApi.actions(),
    enabled,
    staleTime: 5 * 60_000,
  });
}
