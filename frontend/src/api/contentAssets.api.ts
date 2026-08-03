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
import { apiRequest } from './client';

function toQueryString(params: QueryContentAssetsParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const contentAssetsApi = {
  /** GET /content-assets — CONTENT chỉ thấy bài của mình (backend tự scope). */
  list(params: QueryContentAssetsParams = {}): Promise<PaginatedContentAssets> {
    return apiRequest<PaginatedContentAssets>(
      `/content-assets${toQueryString(params)}`,
    );
  },

  /** Hashtag đã dùng trong kho — gợi ý cho ô nhập nhanh. */
  hashtags(): Promise<HashtagSuggestion[]> {
    return apiRequest<HashtagSuggestion[]>('/content-assets/hashtags');
  },

  /** Danh mục đang dùng — gợi ý cho ô "Dạng" chọn/thêm nhanh. */
  categories(): Promise<CategorySuggestion[]> {
    return apiRequest<CategorySuggestion[]>('/content-assets/categories');
  },

  /** Account chọn được vào ô "Editor" — role EDITOR đang hoạt động. */
  editors(): Promise<EditorOption[]> {
    return apiRequest<EditorOption[]>('/content-assets/editors');
  },

  getById(id: string): Promise<ContentAssetResponse> {
    return apiRequest<ContentAssetResponse>(`/content-assets/${id}`);
  },

  /** POST /content-assets — gọi sau khi `mediaApi.upload` xong. */
  create(body: CreateContentAssetBody): Promise<ContentAssetResponse> {
    return apiRequest<ContentAssetResponse>('/content-assets', {
      method: 'POST',
      body,
    });
  },

  update(id: string, body: UpdateContentAssetBody): Promise<ContentAssetResponse> {
    return apiRequest<ContentAssetResponse>(`/content-assets/${id}`, {
      method: 'PATCH',
      body,
    });
  },

  /** Xoá nhiều bài; bài vướng bị bỏ qua kèm lý do (không all-or-nothing). */
  bulkDelete(ids: string[]): Promise<BulkResult> {
    return apiRequest<BulkResult>('/content-assets/bulk-delete', {
      method: 'POST',
      body: { ids },
    });
  },

  /** Ngưng dùng / dùng lại nhiều bài. */
  bulkSetActive(ids: string[], isActive: boolean): Promise<BulkResult> {
    return apiRequest<BulkResult>('/content-assets/bulk-active', {
      method: 'POST',
      body: { ids, isActive },
    });
  },

  remove(id: string): Promise<void> {
    return apiRequest<void>(`/content-assets/${id}`, { method: 'DELETE' });
  },
};
