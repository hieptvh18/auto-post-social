import type {
  CreateReupTopicBody,
  PaginatedReupRuns,
  PaginatedReupTopics,
  PaginatedReupVideos,
  QueryReupTopicsParams,
  QueryReupVideosParams,
  ReupCleanupPreview,
  ReupCleanupRunResult,
  ReupCleanupSettingsResponse,
  ReupDiscoveryResult,
  ReupHealthResponse,
  ReupScheduleSettingsResponse,
  ReupTopicResponse,
  ReupVideoResponse,
  UpdateReupCleanupSettingsBody,
  UpdateReupScheduleBody,
  UpdateReupTopicBody,
  UpdateYoutubeApiSettingsBody,
  YoutubeApiSettingsResponse,
} from '../types';
import { apiRequest } from './client';

function toQueryString<T extends object>(params: T): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Menu Reup Setting — mọi endpoint đều gác `reup:*` (chỉ SUPER_ADMIN). */
export const reupApi = {
  listTopics(
    params: QueryReupTopicsParams = {},
  ): Promise<PaginatedReupTopics> {
    return apiRequest<PaginatedReupTopics>(
      `/reup/topics${toQueryString(params)}`,
    );
  },

  getTopic(id: string): Promise<ReupTopicResponse> {
    return apiRequest<ReupTopicResponse>(`/reup/topics/${id}`);
  },

  createTopic(body: CreateReupTopicBody): Promise<ReupTopicResponse> {
    return apiRequest<ReupTopicResponse>('/reup/topics', {
      method: 'POST',
      body,
    });
  },

  updateTopic(
    id: string,
    body: UpdateReupTopicBody,
  ): Promise<ReupTopicResponse> {
    return apiRequest<ReupTopicResponse>(`/reup/topics/${id}`, {
      method: 'PATCH',
      body,
    });
  },

  /** SOFT DELETE — chỉ tắt chủ đề, giữ nguyên lịch sử video đã kéo. */
  deleteTopic(id: string): Promise<void> {
    return apiRequest<void>(`/reup/topics/${id}`, { method: 'DELETE' });
  },

  /** Vẫn qua claim ở backend ⇒ bấm 2 lần trong ngày chỉ tạo 1 lượt quét. */
  discoverNow(topicId: string): Promise<ReupDiscoveryResult> {
    return apiRequest<ReupDiscoveryResult>(
      `/reup/topics/${topicId}/discover-now`,
      { method: 'POST' },
    );
  },

  listVideos(params: QueryReupVideosParams = {}): Promise<PaginatedReupVideos> {
    return apiRequest<PaginatedReupVideos>(
      `/reup/videos${toQueryString(params)}`,
    );
  },

  retryVideo(id: string): Promise<ReupVideoResponse> {
    return apiRequest<ReupVideoResponse>(`/reup/videos/${id}/retry`, {
      method: 'POST',
    });
  },

  /** Đánh dấu SKIPPED, KHÔNG xoá bản ghi. */
  skipVideo(id: string): Promise<ReupVideoResponse> {
    return apiRequest<ReupVideoResponse>(`/reup/videos/${id}`, {
      method: 'DELETE',
    });
  },

  listRuns(params: { page?: number; limit?: number } = {}): Promise<PaginatedReupRuns> {
    return apiRequest<PaginatedReupRuns>(`/reup/runs${toQueryString(params)}`);
  },

  /** LUÔN trả 200, kể cả khi chưa cài downloader — "chưa cài" là hợp lệ. */
  health(): Promise<ReupHealthResponse> {
    return apiRequest<ReupHealthResponse>('/reup/health');
  },

  getYoutubeSettings(): Promise<YoutubeApiSettingsResponse> {
    return apiRequest<YoutubeApiSettingsResponse>('/reup/settings/youtube');
  },

  updateYoutubeSettings(
    body: UpdateYoutubeApiSettingsBody,
  ): Promise<YoutubeApiSettingsResponse> {
    return apiRequest<YoutubeApiSettingsResponse>('/reup/settings/youtube', {
      method: 'PUT',
      body,
    });
  },

  /** Xoá file của MỘT video reup đã đăng — giữ nguyên bản ghi trong kho (plan 30). */
  deleteVideoResource(id: string): Promise<void> {
    return apiRequest<void>(`/reup/videos/${id}/resource`, {
      method: 'DELETE',
    });
  },

  getCleanupSettings(): Promise<ReupCleanupSettingsResponse> {
    return apiRequest<ReupCleanupSettingsResponse>('/reup/cleanup/settings');
  },

  updateCleanupSettings(
    body: UpdateReupCleanupSettingsBody,
  ): Promise<ReupCleanupSettingsResponse> {
    return apiRequest<ReupCleanupSettingsResponse>('/reup/cleanup/settings', {
      method: 'PUT',
      body,
    });
  },

  /** Không xoá gì — cùng bộ lọc với "Dọn ngay" để con số luôn khớp tuyệt đối. */
  cleanupPreview(): Promise<ReupCleanupPreview> {
    return apiRequest<ReupCleanupPreview>('/reup/cleanup/preview');
  },

  cleanupRun(): Promise<ReupCleanupRunResult> {
    return apiRequest<ReupCleanupRunResult>('/reup/cleanup/run', {
      method: 'POST',
    });
  },

  getSchedule(): Promise<ReupScheduleSettingsResponse> {
    return apiRequest<ReupScheduleSettingsResponse>('/reup/settings/schedule');
  },

  updateSchedule(
    body: UpdateReupScheduleBody,
  ): Promise<ReupScheduleSettingsResponse> {
    return apiRequest<ReupScheduleSettingsResponse>(
      '/reup/settings/schedule',
      { method: 'PUT', body },
    );
  },
};
