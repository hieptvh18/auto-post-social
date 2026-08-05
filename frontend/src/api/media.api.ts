import type { MediaUploadResult } from '../types';
import { apiUpload } from './client';

export const mediaApi = {
  /**
   * POST /media/upload — multipart, field `file`. Stream thẳng lên Google Drive
   * (không lưu disk server). Trả về fileId/driveUrl/thumbnailUrl/mediaType thật.
   *
   * `onProgress` (0–100) = % byte đã đẩy lên server; đạt 100% nghĩa là server
   * đã nhận đủ file và đang stream tiếp sang Drive — UI nên chuyển sang trạng
   * thái "đang xử lý" cho tới khi promise resolve.
   */
  upload(file: File, onProgress?: (percent: number) => void): Promise<MediaUploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    return apiUpload<MediaUploadResult>('/media/upload', formData, onProgress);
  },
};