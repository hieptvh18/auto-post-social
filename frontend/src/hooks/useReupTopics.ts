import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { reupApi } from '../api/reup.api';
import type {
  CreateReupTopicBody,
  PaginatedReupRuns,
  PaginatedReupTopics,
  PaginatedReupVideos,
  QueryReupTopicsParams,
  QueryReupVideosParams,
  ReupCleanupPreview,
  ReupCleanupSettingsResponse,
  ReupHealthResponse,
  ReupScheduleSettingsResponse,
  UpdateReupCleanupSettingsBody,
  UpdateReupScheduleBody,
  UpdateReupTopicBody,
  UpdateYoutubeApiSettingsBody,
  YoutubeApiSettingsResponse,
} from '../types';

const REUP_TOPICS_KEY = 'reup-topics';
const REUP_VIDEOS_KEY = 'reup-videos';
const REUP_RUNS_KEY = 'reup-runs';
const REUP_HEALTH_KEY = 'reup-health';
const REUP_YOUTUBE_SETTINGS_KEY = 'reup-youtube-settings';
const REUP_CLEANUP_SETTINGS_KEY = 'reup-cleanup-settings';
const REUP_CLEANUP_PREVIEW_KEY = 'reup-cleanup-preview';
const REUP_SCHEDULE_KEY = 'reup-schedule';

export function useReupTopics(
  params: QueryReupTopicsParams,
  enabled = true,
): UseQueryResult<PaginatedReupTopics> {
  return useQuery({
    queryKey: [REUP_TOPICS_KEY, params],
    queryFn: () => reupApi.listTopics(params),
    enabled,
  });
}

export function useCreateReupTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReupTopicBody) => reupApi.createTopic(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REUP_TOPICS_KEY] });
    },
  });
}

export function useUpdateReupTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateReupTopicBody }) =>
      reupApi.updateTopic(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REUP_TOPICS_KEY] });
    },
  });
}

export function useDeleteReupTopic() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reupApi.deleteTopic(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REUP_TOPICS_KEY] });
    },
  });
}

/** "Quét ngay" — cũng phải làm mới video/nhật ký, không chỉ danh sách chủ đề. */
export function useDiscoverReupTopicNow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) => reupApi.discoverNow(topicId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REUP_TOPICS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [REUP_VIDEOS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [REUP_RUNS_KEY] });
    },
  });
}

export function useReupVideos(
  params: QueryReupVideosParams,
  enabled = true,
): UseQueryResult<PaginatedReupVideos> {
  return useQuery({
    queryKey: [REUP_VIDEOS_KEY, params],
    queryFn: () => reupApi.listVideos(params),
    enabled,
  });
}

export function useRetryReupVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reupApi.retryVideo(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REUP_VIDEOS_KEY] });
    },
  });
}

export function useSkipReupVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reupApi.skipVideo(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REUP_VIDEOS_KEY] });
    },
  });
}

/** Xoá file Drive của MỘT video reup — bảng "Video đã kéo" phải tự cập nhật Tag. */
export function useDeleteReupVideoResource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => reupApi.deleteVideoResource(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REUP_VIDEOS_KEY] });
      void queryClient.invalidateQueries({
        queryKey: [REUP_CLEANUP_PREVIEW_KEY],
      });
    },
  });
}

export function useReupRuns(
  params: { page?: number; limit?: number },
  enabled = true,
): UseQueryResult<PaginatedReupRuns> {
  return useQuery({
    queryKey: [REUP_RUNS_KEY, params],
    queryFn: () => reupApi.listRuns(params),
    enabled,
  });
}

/** Poll nhẹ — banner "chưa cài downloader" phải tự cập nhật khi user vừa cài xong. */
export function useReupHealth(): UseQueryResult<ReupHealthResponse> {
  return useQuery({
    queryKey: [REUP_HEALTH_KEY],
    queryFn: () => reupApi.health(),
    staleTime: 60_000,
  });
}

export function useYoutubeApiSettings(): UseQueryResult<YoutubeApiSettingsResponse> {
  return useQuery({
    queryKey: [REUP_YOUTUBE_SETTINGS_KEY],
    queryFn: () => reupApi.getYoutubeSettings(),
  });
}

export function useUpdateYoutubeApiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateYoutubeApiSettingsBody) =>
      reupApi.updateYoutubeSettings(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [REUP_YOUTUBE_SETTINGS_KEY],
      });
    },
  });
}

export function useReupCleanupSettings(): UseQueryResult<ReupCleanupSettingsResponse> {
  return useQuery({
    queryKey: [REUP_CLEANUP_SETTINGS_KEY],
    queryFn: () => reupApi.getCleanupSettings(),
  });
}

export function useUpdateReupCleanupSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateReupCleanupSettingsBody) =>
      reupApi.updateCleanupSettings(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [REUP_CLEANUP_SETTINGS_KEY],
      });
      void queryClient.invalidateQueries({
        queryKey: [REUP_CLEANUP_PREVIEW_KEY],
      });
    },
  });
}

/** Không xoá gì — cùng bộ lọc với "Dọn ngay" để con số luôn khớp tuyệt đối. */
export function useReupCleanupPreview(): UseQueryResult<ReupCleanupPreview> {
  return useQuery({
    queryKey: [REUP_CLEANUP_PREVIEW_KEY],
    queryFn: () => reupApi.cleanupPreview(),
  });
}

export function useRunReupCleanup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => reupApi.cleanupRun(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [REUP_CLEANUP_PREVIEW_KEY],
      });
      void queryClient.invalidateQueries({ queryKey: [REUP_VIDEOS_KEY] });
    },
  });
}

export function useReupSchedule(): UseQueryResult<ReupScheduleSettingsResponse> {
  return useQuery({
    queryKey: [REUP_SCHEDULE_KEY],
    queryFn: () => reupApi.getSchedule(),
  });
}

export function useUpdateReupSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateReupScheduleBody) => reupApi.updateSchedule(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [REUP_SCHEDULE_KEY] });
    },
  });
}
