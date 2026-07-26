import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { dashboardApi } from '../api/dashboard.api';
import type {
  DailyChart,
  DashboardHealth,
  DashboardStats,
  PostsByPage,
  QueryDashboardParams,
  QueryPostsByPageParams,
} from '../types';

export const DASHBOARD_KEY = 'dashboard';

/**
 * Mỗi khối một hook riêng: một endpoint hỏng thì ba khối kia vẫn hiển thị được.
 * Dashboard **không** poll (khác `/queue`) — số liệu theo kỳ không đổi theo giây.
 */
export function useDashboardStats(
  params: QueryDashboardParams,
): UseQueryResult<DashboardStats> {
  return useQuery({
    queryKey: [DASHBOARD_KEY, 'stats', params],
    queryFn: () => dashboardApi.getStats(params),
  });
}

export function useDailyChart(
  params: QueryDashboardParams,
): UseQueryResult<DailyChart> {
  return useQuery({
    queryKey: [DASHBOARD_KEY, 'chart-daily', params],
    queryFn: () => dashboardApi.getDailyChart(params),
  });
}

export function usePostsByPage(
  params: QueryPostsByPageParams,
): UseQueryResult<PostsByPage> {
  return useQuery({
    queryKey: [DASHBOARD_KEY, 'posts-by-page', params],
    queryFn: () => dashboardApi.getPostsByPage(params),
  });
}

/**
 * `enabled=false` cho role CONTENT — endpoint này trả 403 với họ, gọi rồi bắt lỗi
 * chỉ tổ nháy đỏ trong console và log 403 rác ở backend.
 */
export function useDashboardHealth(
  enabled = true,
): UseQueryResult<DashboardHealth> {
  return useQuery({
    queryKey: [DASHBOARD_KEY, 'health'],
    queryFn: () => dashboardApi.getHealth(),
    enabled,
  });
}
