import type {
  CreateFacebookPageBody,
  FacebookConnectionResponse,
  FacebookPageCandidate,
  FacebookPageResponse,
  ImportPagesBody,
  ImportPagesResult,
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

  /** Lấy lại Page token từ tài khoản Facebook đã kết nối (chỉ page FB_LOGIN). */
  refreshToken(id: string): Promise<FacebookPageResponse> {
    return apiRequest<FacebookPageResponse>(`/pages/${id}/refresh-token`, {
      method: 'POST',
    });
  },
};

/** Luồng "Đăng nhập bằng Facebook" (plan 15). */
export const pageConnectApi = {
  /** URL dialog OAuth — FE điều hướng cả trang tới đây, không mở popup. */
  authUrl(): Promise<{ url: string }> {
    return apiRequest<{ url: string }>('/pages/connect/url');
  },

  listConnections(): Promise<FacebookConnectionResponse[]> {
    return apiRequest<FacebookConnectionResponse[]>('/pages/connect');
  },

  listCandidates(connectionId: string): Promise<FacebookPageCandidate[]> {
    return apiRequest<FacebookPageCandidate[]>(
      `/pages/connect/${connectionId}/candidates`,
    );
  },

  importPages(
    connectionId: string,
    body: ImportPagesBody,
  ): Promise<ImportPagesResult> {
    return apiRequest<ImportPagesResult>(
      `/pages/connect/${connectionId}/import`,
      { method: 'POST', body },
    );
  },

  revoke(connectionId: string): Promise<void> {
    return apiRequest<void>(`/pages/connect/${connectionId}`, {
      method: 'DELETE',
    });
  },
};
