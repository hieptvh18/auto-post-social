import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { pageConnectApi, pagesApi } from '../api/pages.api';
import type {
  CreateFacebookPageBody,
  FacebookConnectionResponse,
  FacebookPageCandidate,
  FacebookPageResponse,
  ImportPagesBody,
  ImportPagesResult,
  PageConnectionResult,
  UpdateFacebookPageBody,
} from '../types';

const PAGES_KEY = 'pages';
const CONNECTIONS_KEY = 'page-connections';
const CANDIDATES_KEY = 'page-candidates';

export function usePages(): UseQueryResult<FacebookPageResponse[]> {
  return useQuery({
    queryKey: [PAGES_KEY],
    queryFn: () => pagesApi.list(),
  });
}

export function useCreatePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFacebookPageBody) => pagesApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PAGES_KEY] });
    },
  });
}

export function useUpdatePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateFacebookPageBody }) =>
      pagesApi.update(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PAGES_KEY] });
    },
  });
}

/**
 * Test kết nối tới page. `raw` = cấu hình đang nhập trên form (chưa lưu),
 * `saved` = page đã lưu, dùng token trong DB (khi sửa mà không nhập token mới).
 */
export type TestPageConnectionInput =
  | { mode: 'raw'; pageId: string; accessToken: string }
  | { mode: 'saved'; id: string };

export function useTestPageConnection() {
  return useMutation<PageConnectionResult, Error, TestPageConnectionInput>({
    mutationFn: (input) =>
      input.mode === 'saved'
        ? pagesApi.testSavedConnection(input.id)
        : pagesApi.testConnection({
            pageId: input.pageId,
            accessToken: input.accessToken,
          }),
  });
}

export function useDeletePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pagesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PAGES_KEY] });
    },
  });
}

// ───────────────── Đăng nhập bằng Facebook (plan 15) ─────────────────

export function usePageConnections(): UseQueryResult<
  FacebookConnectionResponse[]
> {
  return useQuery({
    queryKey: [CONNECTIONS_KEY],
    queryFn: () => pageConnectApi.listConnections(),
  });
}

/** Danh sách page của một kết nối. Chỉ chạy khi modal chọn page đang mở. */
export function usePageCandidates(
  connectionId: string | null,
): UseQueryResult<FacebookPageCandidate[]> {
  return useQuery({
    queryKey: [CANDIDATES_KEY, connectionId],
    queryFn: () => pageConnectApi.listCandidates(connectionId as string),
    enabled: connectionId !== null,
  });
}

/** Lấy URL dialog rồi điều hướng cả trang sang Facebook. */
export function useStartFacebookConnect() {
  return useMutation({
    mutationFn: () => pageConnectApi.authUrl(),
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
  });
}

export function useImportPages() {
  const queryClient = useQueryClient();
  return useMutation<
    ImportPagesResult,
    Error,
    { connectionId: string; body: ImportPagesBody }
  >({
    mutationFn: ({ connectionId, body }) =>
      pageConnectApi.importPages(connectionId, body),
    onSuccess: (_result, { connectionId }) => {
      void queryClient.invalidateQueries({ queryKey: [PAGES_KEY] });
      void queryClient.invalidateQueries({ queryKey: [CONNECTIONS_KEY] });
      void queryClient.invalidateQueries({
        queryKey: [CANDIDATES_KEY, connectionId],
      });
    },
  });
}

export function useRefreshPageToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pagesApi.refreshToken(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PAGES_KEY] });
    },
  });
}

export function useRevokeConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pageConnectApi.revoke(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CONNECTIONS_KEY] });
      void queryClient.invalidateQueries({ queryKey: [PAGES_KEY] });
    },
  });
}
