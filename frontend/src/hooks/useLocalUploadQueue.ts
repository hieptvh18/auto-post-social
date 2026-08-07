import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/client';
import { mediaUploadJobsApi } from '../api/mediaUploadJobs.api';
import type { CreateMediaUploadJobBody } from '../types';
import {
  hasUnfinishedUpload,
  MAX_PARALLEL_LOCAL_UPLOADS,
  pickNextPending,
  type LocalUpload,
} from '../utils/uploadQueue';
import { MEDIA_UPLOAD_JOBS_KEY } from './useMediaUploadJobs';

export interface LocalUploadQueue {
  uploads: LocalUpload[];
  /** Thêm một lượt upload và **trả về ngay** — modal đóng được lập tức. */
  enqueue: (body: CreateMediaUploadJobBody, files: File[]) => void;
  retry: (id: string) => void;
  /** Bỏ hẳn một lượt đã lỗi (không muốn thử lại nữa). */
  dismiss: (id: string) => void;
}

/**
 * Hàng đợi phía **trình duyệt** cho chặng "đẩy byte lên server" (plan 24b).
 *
 * Vì sao cần: plan 23 đã bỏ được thời gian chờ ở chặng *server → Drive*, nhưng
 * chặng *trình duyệt → server* vẫn tốn đúng bằng đường truyền của người dùng —
 * video 200MB là vài phút, không code nào rút ngắn được. Thứ sửa được là **sự
 * chặn**: bấm Upload xong là modal đóng, byte chạy nền, người dùng xếp tiếp file
 * khác hoặc làm việc khác.
 *
 * Vòng đời một lượt: `PENDING` (chờ tới lượt) → `SENDING` (XHR đang chạy, có %
 * thật) → biến mất khi server trả 202 (từ đó `media_upload_jobs` tiếp quản), hoặc
 * `FAILED` + "Thử lại" dùng lại đúng `File` đã chọn.
 *
 * **Giới hạn đã biết:** F5/đóng tab giữa chừng là mất — `File` chỉ sống trong RAM
 * tab hiện tại. Hook tự bật cảnh báo `beforeunload` khi còn lượt chưa xong.
 */
export function useLocalUploadQueue(): LocalUploadQueue {
  const queryClient = useQueryClient();
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  /** `File` không đưa vào state: nó không phục vụ render, chỉ cần giữ tham chiếu. */
  const filesRef = useRef(new Map<string, File[]>());
  /** Chống chạy trùng khi effect chạy lại (StrictMode dev gọi 2 lần). */
  const startedRef = useRef(new Set<string>());

  const patch = useCallback(
    (id: string, changes: Partial<LocalUpload>) =>
      setUploads((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...changes } : item)),
      ),
    [],
  );

  const run = useCallback(
    async (upload: LocalUpload): Promise<void> => {
      const files = filesRef.current.get(upload.id) ?? [];
      patch(upload.id, { status: 'SENDING', percent: 0, errorMessage: undefined });

      try {
        await mediaUploadJobsApi.create(upload.body, files, (percent) =>
          patch(upload.id, { percent }),
        );
        // Server đã nhận đủ file ⇒ job phía server tiếp quản: bỏ dòng client đi
        // và nạp lại danh sách job để dòng "mờ" thật hiện lên thay chỗ.
        filesRef.current.delete(upload.id);
        setUploads((prev) => prev.filter((item) => item.id !== upload.id));
        void queryClient.invalidateQueries({ queryKey: [MEDIA_UPLOAD_JOBS_KEY] });
      } catch (err) {
        patch(upload.id, {
          status: 'FAILED',
          errorMessage:
            err instanceof ApiError
              ? err.message
              : 'Gửi file lên server thất bại',
        });
      } finally {
        // Xoá khỏi "đã khởi động" để bấm "Thử lại" chạy lại được.
        startedRef.current.delete(upload.id);
      }
    },
    [patch, queryClient],
  );

  // Bộ điều phối: mỗi lần danh sách đổi, lấp đầy số suất còn trống.
  useEffect(() => {
    const next = pickNextPending(uploads, MAX_PARALLEL_LOCAL_UPLOADS);
    for (const id of next) {
      if (startedRef.current.has(id)) continue;
      const upload = uploads.find((item) => item.id === id);
      if (upload === undefined) continue;
      startedRef.current.add(id);
      void run(upload);
    }
  }, [uploads, run]);

  // Rời trang khi byte đang đi ⇒ mất file, phải chọn lại. Cảnh báo trước.
  useEffect(() => {
    if (!hasUnfinishedUpload(uploads)) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [uploads]);

  const enqueue = useCallback(
    (body: CreateMediaUploadJobBody, files: File[]) => {
      const id = crypto.randomUUID();
      filesRef.current.set(id, files);
      setUploads((prev) => [
        ...prev,
        {
          id,
          status: 'PENDING',
          percent: 0,
          title: body.title,
          category: body.category,
          filename: files[0]?.name ?? body.title,
          fileCount: files.length,
          totalSize: files.reduce((sum, file) => sum + file.size, 0),
          createdAt: new Date().toISOString(),
          body,
        },
      ]);
    },
    [],
  );

  const retry = useCallback(
    (id: string) => patch(id, { status: 'PENDING', percent: 0 }),
    [patch],
  );

  const dismiss = useCallback((id: string) => {
    filesRef.current.delete(id);
    setUploads((prev) => prev.filter((item) => item.id !== id));
  }, []);

  return { uploads, enqueue, retry, dismiss };
}
