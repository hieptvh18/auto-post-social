import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { autoPostApi } from '../api/autoPost.api';
import type {
  AutoPostConfigResponse,
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
