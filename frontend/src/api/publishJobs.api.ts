import type {
  Paginated,
  PublishJobEvent,
  PublishJobItem,
  QueryPublishJobsParams,
  RetryJobResult,
} from '../types';
import { apiRequest } from './client';
import { toQueryString } from './queryString';

export const publishJobsApi = {
  /** GET /publish-jobs — phân trang server-side (Failed Jobs nhìn xuyên ngày). */
  list(
    params: QueryPublishJobsParams = {},
  ): Promise<Paginated<PublishJobItem>> {
    return apiRequest<Paginated<PublishJobItem>>(
      `/publish-jobs${toQueryString(params)}`,
    );
  },

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
