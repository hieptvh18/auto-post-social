import type {
  CreateFacebookPageBody,
  FacebookPageResponse,
  PageConnectionResult,
  TestPageConnectionBody,
  UpdateFacebookPageBody,
} from '../types';
import { apiRequest } from './client';

export const pagesApi = {
  /** GET /pages — mọi role, token đã mask. */
  list(): Promise<FacebookPageResponse[]> {
    return apiRequest<FacebookPageResponse[]>('/pages');
  },

  create(body: CreateFacebookPageBody): Promise<FacebookPageResponse> {
    return apiRequest<FacebookPageResponse>('/pages', {
      method: 'POST',
      body,
    });
  },

  update(id: string, body: UpdateFacebookPageBody): Promise<FacebookPageResponse> {
    return apiRequest<FacebookPageResponse>(`/pages/${id}`, {
      method: 'PUT',
      body,
    });
  },

  remove(id: string): Promise<void> {
    return apiRequest<void>(`/pages/${id}`, { method: 'DELETE' });
  },

  /** Test pageId + token vừa nhập trên form (chưa lưu). */
  testConnection(body: TestPageConnectionBody): Promise<PageConnectionResult> {
    return apiRequest<PageConnectionResult>('/pages/test-connection', {
      method: 'POST',
      body,
    });
  },

  /** Test page đã lưu bằng token trong DB — dùng khi sửa mà không đổi token. */
  testSavedConnection(id: string): Promise<PageConnectionResult> {
    return apiRequest<PageConnectionResult>(`/pages/${id}/test-connection`, {
      method: 'POST',
    });
  },
};
