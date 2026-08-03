import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { contentAssetsApi } from '../api/contentAssets.api';
import type {
  BulkResult,
  CategorySuggestion,
  ContentAssetResponse,
  CreateContentAssetBody,
  EditorOption,
  HashtagSuggestion,
  PaginatedContentAssets,
  QueryContentAssetsParams,
  UpdateContentAssetBody,
} from '../types';

const CONTENT_ASSETS_KEY = 'content-assets';
const HASHTAGS_KEY = 'content-hashtags';
const CATEGORIES_KEY = 'content-categories';
const EDITORS_KEY = 'content-editors';

/**
 * Account chọn được vào ô "Editor" (người dựng video/ảnh). Mọi role đã đăng nhập
 * gọi được — khác `GET /users` (chỉ ADMIN) nên CONTENT vẫn chọn editor được.
 */
export function useEditorOptions(): UseQueryResult<EditorOption[]> {
  return useQuery({
    queryKey: [EDITORS_KEY],
    queryFn: () => contentAssetsApi.editors(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Danh mục ("Dạng") đang có bài. Cùng cơ chế với hashtag: không có bảng riêng,
 * gõ tên mới ở form là sinh danh mục mới ⇒ mutation content phải invalidate key này.
 */
export function useCategorySuggestions(
  options: { enabled?: boolean } = {},
): UseQueryResult<CategorySuggestion[]> {
  return useQuery({
    queryKey: [CATEGORIES_KEY],
    queryFn: () => contentAssetsApi.categories(),
    staleTime: 5 * 60 * 1000,
    enabled: options.enabled ?? true,
  });
}

/**
 * Gợi ý hashtag cho ô nhập nhanh. Danh sách đổi chậm nên cache 5 phút; mọi
 * mutation content vẫn invalidate để tag vừa gõ xuất hiện ở lần mở form sau.
 */
export function useHashtagSuggestions(
  options: { enabled?: boolean } = {},
): UseQueryResult<HashtagSuggestion[]> {
  return useQuery({
    queryKey: [HASHTAGS_KEY],
    queryFn: () => contentAssetsApi.hashtags(),
    staleTime: 5 * 60 * 1000,
    enabled: options.enabled ?? true,
  });
}

export function useContentAssets(
  params: QueryContentAssetsParams = {},
): UseQueryResult<PaginatedContentAssets> {
  return useQuery({
    queryKey: [CONTENT_ASSETS_KEY, params],
    queryFn: () => contentAssetsApi.list(params),
  });
}

/**
 * Một bài cụ thể. Dùng cho deep-link `/content?edit=<id>` từ màn "Lịch đăng bài":
 * bài cần mở có thể không nằm trong trang danh sách đang xem nên phải hỏi riêng.
 */
export function useContentAsset(
  id: string | null,
): UseQueryResult<ContentAssetResponse> {
  return useQuery({
    queryKey: [CONTENT_ASSETS_KEY, id],
    queryFn: () => contentAssetsApi.getById(id as string),
    enabled: id !== null,
  });
}

export function useCreateContentAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateContentAssetBody) => contentAssetsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CONTENT_ASSETS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [HASHTAGS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [CATEGORIES_KEY] });
    },
  });
}

export function useUpdateContentAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateContentAssetBody }) =>
      contentAssetsApi.update(id, body),
    onSuccess: (updated: ContentAssetResponse) => {
      void queryClient.invalidateQueries({ queryKey: [CONTENT_ASSETS_KEY] });
      void queryClient.invalidateQueries({
        queryKey: [CONTENT_ASSETS_KEY, updated.id],
      });
      void queryClient.invalidateQueries({ queryKey: [HASHTAGS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [CATEGORIES_KEY] });
    },
  });
}

/**
 * Xoá hàng loạt. Trả `BulkResult` để trang tự quyết cách báo (toast gọn khi xoá
 * hết, liệt kê chi tiết khi có bài bị bỏ qua).
 */
export function useBulkDeleteContentAssets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]): Promise<BulkResult> =>
      contentAssetsApi.bulkDelete(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CONTENT_ASSETS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [HASHTAGS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [CATEGORIES_KEY] });
    },
  });
}

/** Ngưng dùng / dùng lại hàng loạt. */
export function useBulkSetActiveContentAssets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ids,
      isActive,
    }: {
      ids: string[];
      isActive: boolean;
    }): Promise<BulkResult> => contentAssetsApi.bulkSetActive(ids, isActive),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CONTENT_ASSETS_KEY] });
    },
  });
}

export function useDeleteContentAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => contentAssetsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CONTENT_ASSETS_KEY] });
    },
  });
}
