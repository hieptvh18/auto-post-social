import type {
  CreateMediaUploadJobBody,
  MediaUploadJobResponse,
  MediaUploadStatus,
} from '../types';
import { apiRequest, apiUpload } from './client';
import { toQueryString } from './queryString';

export const mediaUploadJobsApi = {
  /**
   * POST /media/upload-jobs — multipart, field `files` (nhiều ảnh = 1 bài).
   * Trả **202** ngay khi server nhận xong file: phần đẩy lên Google Drive + tạo
   * bài chạy nền qua hàng đợi, nên modal đóng được luôn.
   *
   * `onProgress` (0–100) = % byte đã đẩy lên server. 503 = hệ thống đang xử lý
   * tối đa số file cho phép — giữ nguyên file đã chọn để bấm lại.
   */
  create(
    body: CreateMediaUploadJobBody,
    files: File[],
    onProgress?: (percent: number) => void,
  ): Promise<MediaUploadJobResponse> {
    const formData = new FormData();
    for (const file of files) formData.append('files', file);
    formData.append('title', body.title);
    formData.append('category', body.category);
    formData.append('caption', body.caption);
    if (body.description) formData.append('description', body.description);
    if (body.hashtags) formData.append('hashtags', body.hashtags);
    if (body.editorId) formData.append('editorId', body.editorId);
    // Multipart không có kiểu ⇒ gửi mảng dưới dạng chuỗi JSON, backend parse lại.
    formData.append('assignedPageIds', JSON.stringify(body.assignedPageIds ?? []));

    return apiUpload<MediaUploadJobResponse>(
      '/media/upload-jobs',
      formData,
      onProgress,
    );
  },

  list(params: { status?: MediaUploadStatus; limit?: number } = {}): Promise<
    MediaUploadJobResponse[]
  > {
    return apiRequest<MediaUploadJobResponse[]>(
      `/media/upload-jobs${toQueryString(params)}`,
    );
  },

  retry(id: string): Promise<MediaUploadJobResponse> {
    return apiRequest<MediaUploadJobResponse>(`/media/upload-jobs/${id}/retry`, {
      method: 'POST',
    });
  },
};
