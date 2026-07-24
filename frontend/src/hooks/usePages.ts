import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { pagesApi } from '../api/pages.api';
import type {
  CreateFacebookPageBody,
  FacebookPageResponse,
  UpdateFacebookPageBody,
} from '../types';

const PAGES_KEY = 'pages';

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

export function useDeletePage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pagesApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PAGES_KEY] });
    },
  });
}
