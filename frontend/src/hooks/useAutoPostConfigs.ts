import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { autoPostApi } from '../api/autoPost.api';
import type {
  AutoPostConfigResponse,
  CategoryAvailability,
  CreateAutoPostSlotBody,
  UpdateAutoPostSlotBody,
} from '../types';

const AUTO_POST_KEY = 'auto-post-configs';

export function useAutoPostConfigs(): UseQueryResult<AutoPostConfigResponse[]> {
  return useQuery({
    queryKey: [AUTO_POST_KEY],
    queryFn: () => autoPostApi.listConfigs(),
  });
}

/**
 * Kho bài của page tách theo danh mục — cho form mốc giờ. Chỉ gọi khi modal mở
 * (`pageId` khác `undefined`); `staleTime: 0` để đóng/mở lại là thấy số mới sau
 * khi Bot vừa đăng.
 */
export function useCategoryAvailability(
  pageId: string | undefined,
): UseQueryResult<CategoryAvailability[]> {
  return useQuery({
    queryKey: [AUTO_POST_KEY, 'category-availability', pageId],
    queryFn: () => autoPostApi.listCategoryAvailability(pageId as string),
    enabled: pageId !== undefined,
    staleTime: 0,
  });
}

export function useSetAutoPostEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ pageId, enabled }: { pageId: string; enabled: boolean }) =>
      autoPostApi.setEnabled(pageId, enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [AUTO_POST_KEY] });
    },
  });
}

export function useCreateSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      pageId,
      body,
    }: {
      pageId: string;
      body: CreateAutoPostSlotBody;
    }) => autoPostApi.createSlot(pageId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [AUTO_POST_KEY] });
    },
  });
}

export function useUpdateSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      slotId,
      body,
    }: {
      slotId: string;
      body: UpdateAutoPostSlotBody;
    }) => autoPostApi.updateSlot(slotId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [AUTO_POST_KEY] });
    },
  });
}

export function useDeleteSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (slotId: string) => autoPostApi.removeSlot(slotId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [AUTO_POST_KEY] });
    },
  });
}
