import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { autoPostApi } from '../api/autoPost.api';
import { publishScheduleApi } from '../api/publishSchedule.api';
import type {
  PublishScheduleResponse,
  QueryPublishScheduleParams,
  RunSlotResult,
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

/** Chạy lại ngay một mốc giờ mà Bot đã bỏ qua (hết bài / backend không chạy lúc đó). */
export function useRunSlotNow(): UseMutationResult<
  RunSlotResult,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => autoPostApi.runSlotNow(slotId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SCHEDULE_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['auto-post-configs'] });
    },
  });
}
