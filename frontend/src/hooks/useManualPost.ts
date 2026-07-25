import { useMutation, useQueryClient } from '@tanstack/react-query';
import { manualPostApi } from '../api/manualPost.api';
import type { ManualPostBody } from '../types';

export function useManualPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ManualPostBody) => manualPostApi.publishNow(body),
    onSuccess: () => {
      // Bài vừa đăng đổi sang PUBLISHED ⇒ danh sách content phải nạp lại.
      void queryClient.invalidateQueries({ queryKey: ['content-assets'] });
    },
  });
}
