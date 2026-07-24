import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { contentAssetsApi } from '../api/contentAssets.api';
import type {
  ContentAssetResponse,
  CreateContentAssetBody,
  PaginatedContentAssets,
  QueryContentAssetsParams,
  UpdateContentAssetBody,
} from '../types';

const CONTENT_ASSETS_KEY = 'content-assets';

export function useContentAssets(
  params: QueryContentAssetsParams = {},
): UseQueryResult<PaginatedContentAssets> {
  return useQuery({
    queryKey: [CONTENT_ASSETS_KEY, params],
    queryFn: () => contentAssetsApi.list(params),
  });
}

export function useCreateContentAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateContentAssetBody) => contentAssetsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CONTENT_ASSETS_KEY] });
    },
  });
}

export function useUpdateContentAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateContentAssetBody }) =>
      contentAssetsApi.update(id, body),
    onSuccess: (updated: ContentAssetResponse) => {
      void queryClient.invalidateQueries({ queryKey: [CONTENT_ASSETS_KEY] });
      void queryClient.invalidateQueries({
        queryKey: [CONTENT_ASSETS_KEY, updated.id],
      });
    },
  });
}

export function useDeleteContentAsset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => contentAssetsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CONTENT_ASSETS_KEY] });
    },
  });
}
