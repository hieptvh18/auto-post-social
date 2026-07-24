import type {
  ContentAssetResponse,
  CreateContentAssetBody,
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

  remove(id: string): Promise<void> {
    return apiRequest<void>(`/content-assets/${id}`, { method: 'DELETE' });
  },
};
