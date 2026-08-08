import type {
  PageInsightsSummary,
  PostInsightsListResponse,
  QueryPostInsightsParams,
  SyncInsightsResult,
} from '../types';
import { apiRequest } from './client';
import { toQueryString } from './queryString';

/** Thống kê bài **do tool đăng** lên một page (plan 25). */
export const postInsightsApi = {
  /** GET /pages/:pageId/insights/posts — mặc định bài mới nhất trước. */
  listPosts(
    pageId: string,
    params: QueryPostInsightsParams = {},
  ): Promise<PostInsightsListResponse> {
    return apiRequest<PostInsightsListResponse>(
      `/pages/${pageId}/insights/posts${toQueryString(params)}`,
    );
  },

  /** GET /pages/:pageId/insights/summary */
  getSummary(pageId: string): Promise<PageInsightsSummary> {
    return apiRequest<PageInsightsSummary>(`/pages/${pageId}/insights/summary`);
  },

  /** POST /pages/:pageId/insights/sync — throttle 5 phút/page ⇒ có thể trả 429. */
  sync(pageId: string): Promise<SyncInsightsResult> {
    return apiRequest<SyncInsightsResult>(`/pages/${pageId}/insights/sync`, {
      method: 'POST',
    });
  },
};
