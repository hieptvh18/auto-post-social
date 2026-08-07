import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { driveImportsApi } from '../api/driveImports.api';
import type {
  CreateDriveImportBody,
  DriveImportInspectItem,
  DriveImportResult,
} from '../types';
import { MEDIA_UPLOAD_JOBS_KEY } from './useMediaUploadJobs';

/**
 * Dò loại file của danh sách link. **Mutation** chứ không phải query: nó chạy
 * theo nhịp gõ của người dùng (có debounce ở component), không nên tự refetch
 * hay cache theo từng chuỗi link đang gõ dở.
 */
export function useInspectDriveLinks(): UseMutationResult<
  { items: DriveImportInspectItem[] },
  Error,
  string[]
> {
  return useMutation({ mutationFn: (links) => driveImportsApi.inspect(links) });
}

export function useCreateDriveImport(): UseMutationResult<
  DriveImportResult,
  Error,
  CreateDriveImportBody
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body) => driveImportsApi.create(body),
    // Dòng "mờ" phải hiện ngay khi modal đóng, không đợi nhịp poll kế tiếp.
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [MEDIA_UPLOAD_JOBS_KEY] }),
  });
}
