import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { autoPostApi } from '../api/autoPost.api';
import {
  publishJobsApi,
  publishScheduleApi,
} from '../api/publishSchedule.api';
import type {
  PublishJobEvent,
  PublishScheduleResponse,
  QueryPublishScheduleParams,
  RetryJobResult,
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

/** Nhật ký một job — chỉ nạp khi người dùng mở xem (job lỗi). */
export function usePublishJobEvents(
  jobId: string | null,
): UseQueryResult<PublishJobEvent[]> {
  return useQuery({
    queryKey: [SCHEDULE_KEY, 'events', jobId],
    queryFn: () => publishJobsApi.events(jobId as string),
    enabled: jobId !== null,
  });
}

/** Đăng lại một job đã thất bại — lịch và nhật ký phải nạp lại ngay sau đó. */
export function useRetryPublishJob(): UseMutationResult<
  RetryJobResult,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => publishJobsApi.retry(jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SCHEDULE_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['content-assets'] });
    },
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
