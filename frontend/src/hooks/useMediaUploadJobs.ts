import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { mediaUploadJobsApi } from '../api/mediaUploadJobs.api';
import type {
  CreateMediaUploadJobBody,
  MediaUploadJobResponse,
} from '../types';

export const MEDIA_UPLOAD_JOBS_KEY = 'media-upload-jobs';

/** Job chưa kết thúc — còn dòng "mờ" trên bảng thì còn phải poll. */
const ACTIVE_STATUSES: MediaUploadJobResponse['status'][] = [
  'QUEUED',
  'UPLOADING_TO_DRIVE',
  'COPYING_FROM_DRIVE',
];

/** Đủ nhanh để thấy dòng mờ đổi trạng thái, đủ chậm để không đập vào backend. */
const REFETCH_INTERVAL_MS = 3_000;

export function isActiveUploadJob(job: MediaUploadJobResponse): boolean {
  return ACTIVE_STATUSES.includes(job.status);
}

/**
 * Job upload của chính mình. **Chỉ poll khi thật sự có job đang chạy** — không
 * ai upload thì query nằm im (cùng tinh thần `useMonitor`, plan 13 §3.3).
 *
 * `FAILED` vẫn nằm trong danh sách trả về (backend giữ job tới hết TTL) để dòng
 * mờ đổi màu lỗi kèm nút "Thử lại" thay vì biến mất không dấu vết.
 */
export function useMediaUploadJobs(
  enabled = true,
): UseQueryResult<MediaUploadJobResponse[]> {
  return useQuery({
    queryKey: [MEDIA_UPLOAD_JOBS_KEY],
    queryFn: () => mediaUploadJobsApi.list({ limit: 50 }),
    enabled,
    refetchInterval: (query) => {
      const jobs = query.state.data;
      if (jobs === undefined) return false;
      return jobs.some(isActiveUploadJob) ? REFETCH_INTERVAL_MS : false;
    },
  });
}

export function useCreateMediaUploadJob(): UseMutationResult<
  MediaUploadJobResponse,
  Error,
  {
    body: CreateMediaUploadJobBody;
    files: File[];
    onProgress?: (percent: number) => void;
  }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ body, files, onProgress }) =>
      mediaUploadJobsApi.create(body, files, onProgress),
    // Dòng mờ phải hiện ngay khi modal đóng, không đợi nhịp poll kế tiếp.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [MEDIA_UPLOAD_JOBS_KEY] }),
  });
}

export function useRetryMediaUploadJob(): UseMutationResult<
  MediaUploadJobResponse,
  Error,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => mediaUploadJobsApi.retry(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [MEDIA_UPLOAD_JOBS_KEY] }),
  });
}
