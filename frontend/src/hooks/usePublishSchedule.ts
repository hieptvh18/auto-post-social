import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { publishScheduleApi } from '../api/publishSchedule.api';
import type {
  PublishScheduleResponse,
  QueryPublishScheduleParams,
} from '../types';

const SCHEDULE_KEY = 'publish-schedule';

/** Refetch định kỳ để thấy job đổi trạng thái mà không phải F5. */
const REFETCH_INTERVAL_MS = 30_000;

export function usePublishSchedule(
  params: QueryPublishScheduleParams,
  enabled = true,
): UseQueryResult<PublishScheduleResponse> {
  return useQuery({
    queryKey: [SCHEDULE_KEY, params],
    queryFn: () => publishScheduleApi.get(params),
    enabled,
    refetchInterval: REFETCH_INTERVAL_MS,
  });
}
