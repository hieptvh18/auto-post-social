import type {
  DashboardAlert,
  DashboardHealth,
  DashboardStats,
} from './dashboard.types';

export interface DashboardHealthResponse {
  checkedAt: string;
  alerts: DashboardAlert[];
}

/** `Date` ra API luôn là chuỗi ISO — giữ đúng quy ước của các mapper khác. */
export function toDashboardHealthResponse(
  health: DashboardHealth,
): DashboardHealthResponse {
  return {
    checkedAt: health.checkedAt.toISOString(),
    alerts: health.alerts,
  };
}

export type DashboardStatsResponse = DashboardStats;
