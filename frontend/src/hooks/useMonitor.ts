import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { monitorApi } from '../api/monitor.api';
import type { QueueSummary } from '../types';

export const MONITOR_KEY = 'monitor';

/** Queue chạy theo giây — poll 10s để thấy số nhảy mà không cần F5 (plan 13 §3.3). */
const REFETCH_INTERVAL_MS = 10_000;

export function useQueueSummary(
  enabled = true,
): UseQueryResult<QueueSummary> {
  return useQuery({
    queryKey: [MONITOR_KEY, 'queue'],
    queryFn: () => monitorApi.getQueueSummary(),
    enabled,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
