import type { MediaUploadResult } from '../types';
import { apiRequest } from './client';

export const mediaApi = {
  /**
   * POST /media/upload — multipart, field `file`. Stream thẳng lên Google Drive
   * (không lưu disk server). Trả về fileId/driveUrl/thumbnailUrl/mediaType thật.
   */
  upload(file: File): Promise<MediaUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    return apiRequest<MediaUploadResult>('/media/upload', {
      method: 'POST',
      formData,
    });
  },
};