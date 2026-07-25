import type {
  PublishJobEvent,
  PublishScheduleResponse,
  QueryPublishScheduleParams,
  RetryJobResult,
} from '../types';
import { apiRequest } from './client';

function toQueryString(params: QueryPublishScheduleParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const publishScheduleApi = {
  /** GET /publish-schedule — mốc giờ đã cấu hình + job thực tế của một ngày. */
  get(
    params: QueryPublishScheduleParams = {},
  ): Promise<PublishScheduleResponse> {
    return apiRequest<PublishScheduleResponse>(
      `/publish-schedule${toQueryString(params)}`,
    );
  },
};

export const publishJobsApi = {
  /** GET /publish-jobs/:id/events — nhật ký từng lần thử đăng của một job. */
  events(jobId: string): Promise<PublishJobEvent[]> {
    return apiRequest<PublishJobEvent[]>(`/publish-jobs/${jobId}/events`);
  },

  /** POST /publish-jobs/:id/retry — xếp hàng đăng lại một job đã thất bại. */
  retry(jobId: string): Promise<RetryJobResult> {
    return apiRequest<RetryJobResult>(`/publish-jobs/${jobId}/retry`, {
      method: 'POST',
    });
  },
};
