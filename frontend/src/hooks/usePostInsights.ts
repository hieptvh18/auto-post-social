import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { postInsightsApi } from '../api/postInsights.api';
import type {
  PageInsightsSummary,
  PostInsightsListResponse,
  QueryPostInsightsParams,
  SyncInsightsResult,
} from '../types';

const INSIGHTS_KEY = 'post-insights';

export function usePostInsights(
  pageId: string,
  params: QueryPostInsightsParams,
): UseQueryResult<PostInsightsListResponse> {
  return useQuery({
    queryKey: [INSIGHTS_KEY, 'posts', pageId, params],
    queryFn: () => postInsightsApi.listPosts(pageId, params),
    enabled: pageId !== '',
  });
}

export function usePageInsightsSummary(
  pageId: string,
): UseQueryResult<PageInsightsSummary> {
  return useQuery({
    queryKey: [INSIGHTS_KEY, 'summary', pageId],
    queryFn: () => postInsightsApi.getSummary(pageId),
    enabled: pageId !== '',
  });
}

/**
 * Nút "Đồng bộ ngay". Phải làm mới **cả** danh sách lẫn thẻ tổng — chỉ invalidate
 * một trong hai sẽ ra màn hình mà bảng đã cập nhật còn thẻ số vẫn là số cũ.
 */
export function useSyncInsights(
  pageId: string,
): UseMutationResult<SyncInsightsResult, Error, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => postInsightsApi.sync(pageId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [INSIGHTS_KEY] });
      // Cột "Bài đã đăng" ở màn Quản lý Page đọc từ `GET /pages`.
      void queryClient.invalidateQueries({ queryKey: ['pages'] });
    },
  });
}
