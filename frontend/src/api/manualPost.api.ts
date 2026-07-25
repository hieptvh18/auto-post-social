import type { ManualPostBody, ManualPostResponse } from '../types';
import { apiRequest } from './client';

export const manualPostApi = {
  /**
   * POST /manual-post — backend đăng thẳng lên Facebook rồi mới trả về, nên
   * request này chậm (video có thể tới vài chục giây).
   */
  publishNow(body: ManualPostBody): Promise<ManualPostResponse> {
    return apiRequest<ManualPostResponse>('/manual-post', {
      method: 'POST',
      body,
    });
  },
};
