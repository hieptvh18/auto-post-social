import type {
  AutoPostConfigResponse,
  AutoPostSlotResponse,
  CreateAutoPostSlotBody,
  UpdateAutoPostConfigResponse,
  UpdateAutoPostSlotBody,
} from '../types';
import { apiRequest } from './client';

export const autoPostApi = {
  /** GET /auto-post-configs — mọi page kèm slot đã sắp theo giờ. */
  listConfigs(): Promise<AutoPostConfigResponse[]> {
    return apiRequest<AutoPostConfigResponse[]>('/auto-post-configs');
  },

  setEnabled(
    pageId: string,
    enabled: boolean,
  ): Promise<UpdateAutoPostConfigResponse> {
    return apiRequest<UpdateAutoPostConfigResponse>(
      `/auto-post-configs/${pageId}`,
      { method: 'PATCH', body: { enabled } },
    );
  },

  createSlot(
    pageId: string,
    body: CreateAutoPostSlotBody,
  ): Promise<AutoPostSlotResponse> {
    return apiRequest<AutoPostSlotResponse>(
      `/auto-post-configs/${pageId}/slots`,
      { method: 'POST', body },
    );
  },

  updateSlot(
    slotId: string,
    body: UpdateAutoPostSlotBody,
  ): Promise<AutoPostSlotResponse> {
    return apiRequest<AutoPostSlotResponse>(`/auto-post-slots/${slotId}`, {
      method: 'PATCH',
      body,
    });
  },

  removeSlot(slotId: string): Promise<void> {
    return apiRequest<void>(`/auto-post-slots/${slotId}`, { method: 'DELETE' });
  },
};
