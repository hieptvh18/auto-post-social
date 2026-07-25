import type {
  PublishScheduleResponse,
  QueryPublishScheduleParams,
} from '../types';
import { apiRequest } from './client';
import { toQueryString } from './queryString';

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
