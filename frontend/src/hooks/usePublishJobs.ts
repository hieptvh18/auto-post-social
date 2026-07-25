import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { publishJobsApi } from '../api/publishJobs.api';
import type {
  Paginated,
  PublishJobEvent,
  PublishJobItem,
  QueryPublishJobsParams,
  RetryJobResult,
} from '../types';

export const PUBLISH_JOBS_KEY = 'publish-jobs';

export function usePublishJobs(
  params: QueryPublishJobsParams,
): UseQueryResult<Paginated<PublishJobItem>> {
  return useQuery({
    queryKey: [PUBLISH_JOBS_KEY, params],
    queryFn: () => publishJobsApi.list(params),
  });
}

/** Danh sách job đăng hỏng — phân trang server-side, có thể có rất nhiều. */
export function useFailedJobs(
  page: number,
  pageSize = 20,
): UseQueryResult<Paginated<PublishJobItem>> {
  return usePublishJobs({ status: 'FAILED', page, pageSize });
}

/** Nhật ký một job — chỉ nạp khi người dùng mở xem. */
export function usePublishJobEvents(
  jobId: string | null,
): UseQueryResult<PublishJobEvent[]> {
  return useQuery({
    queryKey: [PUBLISH_JOBS_KEY, 'events', jobId],
    queryFn: () => publishJobsApi.events(jobId as string),
    enabled: jobId !== null,
  });
}

/**
 * Đăng lại một job đã hỏng. Job vừa quay lại hàng đợi nên phải nạp lại cả
 * danh sách job, lịch đăng bài lẫn số liệu queue — nếu không màn Monitor sẽ
 * hiển thị số cũ đúng ngay sau khi người dùng vừa bấm.
 */
export function useRetryPublishJob(): UseMutationResult<
  RetryJobResult,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => publishJobsApi.retry(jobId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PUBLISH_JOBS_KEY] });
      void queryClient.invalidateQueries({ queryKey: ['publish-schedule'] });
      void queryClient.invalidateQueries({ queryKey: ['monitor'] });
      void queryClient.invalidateQueries({ queryKey: ['content-assets'] });
    },
  });
}
