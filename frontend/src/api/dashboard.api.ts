import type {
  DailyChart,
  DashboardHealth,
  DashboardStats,
  PostsByPage,
  QueryDashboardParams,
  QueryPostsByPageParams,
} from '../types';
import { apiRequest } from './client';
import { toQueryString } from './queryString';

export const dashboardApi = {
  /** GET /dashboard/stats — thẻ số (tồn kho + sản lượng + đang chạy). */
  getStats(params: QueryDashboardParams = {}): Promise<DashboardStats> {
    return apiRequest<DashboardStats>(`/dashboard/stats${toQueryString(params)}`);
  },

  /** GET /dashboard/chart/daily — bài đăng theo từng ngày (đã điền ngày trống). */
  getDailyChart(params: QueryDashboardParams = {}): Promise<DailyChart> {
    return apiRequest<DailyChart>(
      `/dashboard/chart/daily${toQueryString(params)}`,
    );
  },

  /** GET /dashboard/posts-by-page — bài đăng theo page, tách ảnh/video. */
  getPostsByPage(params: QueryPostsByPageParams = {}): Promise<PostsByPage> {
    return apiRequest<PostsByPage>(
      `/dashboard/posts-by-page${toQueryString(params)}`,
    );
  },

  /** GET /dashboard/health — khối "Cần chú ý" (ADMIN/EDITOR; CONTENT bị 403). */
  getHealth(): Promise<DashboardHealth> {
    return apiRequest<DashboardHealth>('/dashboard/health');
  },
};
