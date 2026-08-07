import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../client';
import { mediaUploadJobsApi } from '../mediaUploadJobs.api';
import { tokenStore } from '../tokenStore';

/** Cùng cách giả lập XHR như `media.api.test.ts` (fetch không có upload progress). */
interface XhrCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function stubXhr(status: number, body: unknown): XhrCall[] {
  const calls: XhrCall[] = [];

  class FakeXhr {
    upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    status = 0;
    responseText = '';
    private call: XhrCall = { method: '', url: '', headers: {}, body: undefined };

    open(method: string, url: string): void {
      this.call.method = method;
      this.call.url = url;
    }

    setRequestHeader(name: string, value: string): void {
      this.call.headers[name] = value;
    }

    send(data: unknown): void {
      this.call.body = data;
      calls.push(this.call);
      this.status = status;
      this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
      queueMicrotask(() => this.onload?.());
    }
  }

  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return calls;
}

const JOB = {
  id: 'job-1',
  status: 'QUEUED' as const,
  title: 'Ảnh khai trương',
  category: 'Review',
  mediaType: 'image' as const,
  originalFilename: 'anh-1.jpg',
  fileCount: 2,
  totalSize: 2048,
  errorMessage: null,
  attemptCount: 0,
  contentAssetId: null,
  canRetry: false,
  createdBy: { id: 'user-1', name: 'Nguyễn Content' },
  createdAt: '2026-08-07T03:00:00.000Z',
  updatedAt: '2026-08-07T03:00:00.000Z',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mediaUploadJobsApi.create', () => {
  it('gửi MỌI file trong cùng field "files" (nhiều ảnh = 1 bài)', async () => {
    localStorage.clear();
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const calls = stubXhr(202, JOB);

    const files = [
      new File(['a'], 'anh-1.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'anh-2.jpg', { type: 'image/jpeg' }),
    ];
    const res = await mediaUploadJobsApi.create(
      {
        title: 'Ảnh khai trương',
        category: 'Review',
        caption: 'Caption',
        assignedPageIds: ['page-1'],
      },
      files,
    );

    expect(res).toEqual(JOB);
    const form = calls[0].body as FormData;
    expect(form.getAll('files')).toEqual(files);
    expect(calls[0].url).toContain('/media/upload-jobs');
    // Mảng phải đi dưới dạng chuỗi JSON — multipart không có kiểu.
    expect(form.get('assignedPageIds')).toBe('["page-1"]');
  });

  it('không gửi field rỗng (hashtags/editorId) để backend không nhận chuỗi rỗng', async () => {
    localStorage.clear();
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const calls = stubXhr(202, JOB);

    await mediaUploadJobsApi.create(
      { title: 'T', category: 'C', caption: 'Cap' },
      [new File(['a'], 'a.jpg', { type: 'image/jpeg' })],
    );

    const form = calls[0].body as FormData;
    expect(form.get('hashtags')).toBeNull();
    expect(form.get('editorId')).toBeNull();
    expect(form.get('assignedPageIds')).toBe('[]');
  });

  it('giữ nguyên message 503 của backend khi hệ thống quá tải', async () => {
    localStorage.clear();
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    stubXhr(503, {
      message: 'Hệ thống đang xử lý tối đa 20 file upload cho phép, vui lòng thử lại sau',
    });

    await expect(
      mediaUploadJobsApi.create({ title: 'T', category: 'C', caption: 'Cap' }, [
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      ]),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('tối đa 20 file') as unknown as string,
    });
  });

  it('lỗi trả về là ApiError để UI đọc được statusCode', async () => {
    localStorage.clear();
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    stubXhr(400, { message: 'File vượt giới hạn 500MB' });

    await expect(
      mediaUploadJobsApi.create({ title: 'T', category: 'C', caption: 'Cap' }, [
        new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      ]),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
