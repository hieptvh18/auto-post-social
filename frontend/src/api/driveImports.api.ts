import type {
  CreateDriveImportBody,
  DriveImportInspectItem,
  DriveImportResult,
} from '../types';
import { apiRequest } from './client';

export const driveImportsApi = {
  /**
   * POST /media/drive-imports/inspect — **chỉ đọc**: loại file của từng link.
   * Gọi ngầm sau khi người dùng ngừng gõ, để biết có cho tick "gộp ảnh" không.
   */
  inspect(links: string[]): Promise<{ items: DriveImportInspectItem[] }> {
    return apiRequest<{ items: DriveImportInspectItem[] }>(
      '/media/drive-imports/inspect',
      { method: 'POST', body: { links } },
    );
  },

  /**
   * POST /media/drive-imports — trả **202** ngay; việc copy từ Drive nguồn về
   * folder của tool chạy nền, theo dõi bằng dòng "mờ" như luồng upload file.
   *
   * Dòng link hỏng **không** làm hỏng cả lô: chúng nằm trong `skipped` kèm lý do.
   * Chỉ khi **không dòng nào** dùng được thì backend mới trả 400.
   */
  create(body: CreateDriveImportBody): Promise<DriveImportResult> {
    return apiRequest<DriveImportResult>('/media/drive-imports', {
      method: 'POST',
      // `apiRequest` tự stringify — truyền chuỗi ở đây sẽ thành JSON lồng JSON.
      body,
    });
  },
};
