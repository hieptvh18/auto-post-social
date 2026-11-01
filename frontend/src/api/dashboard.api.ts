import type {
  DailyChart,
  DashboardHealth,
  DashboardStats,
  PostsByPage,
  PublishReport,
  QueryDashboardParams,
  QueryPostsByPageParams,
  QueryPublishReportParams,
  QueryTopCategoriesParams,
  TopCategories,
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

  /** GET /dashboard/top-categories — top danh mục đăng thành công nhiều nhất (mặc định 10). */
  getTopCategories(
    params: QueryTopCategoriesParams = {},
  ): Promise<TopCategories> {
    return apiRequest<TopCategories>(
      `/dashboard/top-categories${toQueryString(params)}`,
    );
  },

  /** GET /dashboard/publish-report — số bài đã đăng theo page × ngày/tháng (plan 35). */
  getPublishReport(params: QueryPublishReportParams = {}): Promise<PublishReport> {
    const { pageIds, categories, ...rest } = params;
    return apiRequest<PublishReport>(
      `/dashboard/publish-report${toQueryString({
        ...rest,
        pageIds: pageIds?.length ? pageIds.join(',') : undefined,
        categories: categories?.length ? categories.join(',') : undefined,
      })}`,
    );
  },

  /** GET /dashboard/health — khối "Cần chú ý" (ADMIN/EDITOR; CONTENT bị 403). */
  getHealth(): Promise<DashboardHealth> {
    return apiRequest<DashboardHealth>('/dashboard/health');
  },
};
