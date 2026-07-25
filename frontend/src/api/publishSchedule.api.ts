import type {
  PublishScheduleResponse,
  QueryPublishScheduleParams,
} from '../types';
import { apiRequest } from './client';

function toQueryString(params: QueryPublishScheduleParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

export const publishScheduleApi = {
  /** GET /publish-schedule — mốc giờ đã cấu hình + job thực tế của một ngày. */
  get(
    params: QueryPublishScheduleParams = {},
  ): Promise<PublishScheduleResponse> {
    return apiRequest<PublishScheduleResponse>(
      `/publish-schedule${toQueryString(params)}`,
    );
  },
};
