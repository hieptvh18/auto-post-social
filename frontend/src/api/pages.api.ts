import type {
  CreateFacebookPageBody,
  FacebookPageResponse,
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
};
