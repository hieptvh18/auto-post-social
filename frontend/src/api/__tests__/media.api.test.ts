import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaApi } from '../media.api';
import { tokenStore } from '../tokenStore';

/**
 * Upload đi qua XMLHttpRequest (fetch không expose tiến trình upload) nên test
 * phải giả lập XHR: ghi lại open/header/body rồi bắn progress + onload thủ công.
 */
interface XhrCall {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function stubXhr(status: number, body: unknown, progress: number[] = []): XhrCall[] {
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
      for (const loaded of progress) {
        this.upload.onprogress?.({
          lengthComputable: true,
          loaded,
          total: 100,
        } as ProgressEvent);
      }
      this.status = status;
      this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
      queueMicrotask(() => this.onload?.());
    }
  }

  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mediaApi.upload', () => {
  it('POST /media/upload dạng multipart với field "file", trả kết quả Drive', async () => {
    localStorage.clear();
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const result = {
      fileId: 'drive-abc',
      driveUrl: 'https://drive.google.com/file/d/drive-abc',
      thumbnailUrl: 'https://drive.google.com/thumb/drive-abc',
      mimeType: 'image/png',
      size: 1234,
      mediaType: 'image' as const,
    };
    const calls = stubXhr(201, result);

    const file = new File(['x'], 'anh.png', { type: 'image/png' });
    const res = await mediaApi.upload(file);

    expect(res).toEqual(result);
    const call = calls[0];
    expect(call.url).toContain('/media/upload');
    expect(call.method).toBe('POST');
    expect(call.body).toBeInstanceOf(FormData);
    expect((call.body as FormData).get('file')).toBe(file);
    // KHÔNG tự set Content-Type — để trình duyệt gắn boundary multipart.
    expect(call.headers['Content-Type']).toBeUndefined();
    expect(call.headers.Authorization).toBe('Bearer acc-1');
  });

  it('gọi onProgress theo % byte đã đẩy lên', async () => {
    localStorage.clear();
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    stubXhr(201, { fileId: 'x' }, [25, 100]);

    const percents: number[] = [];
    await mediaApi.upload(new File(['x'], 'a.png', { type: 'image/png' }), (p) =>
      percents.push(p),
    );

    expect(percents).toEqual([25, 100]);
  });

  it('ném ApiError với message từ backend khi request lỗi', async () => {
    localStorage.clear();
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    stubXhr(400, { message: 'File không hợp lệ' });

    await expect(
      mediaApi.upload(new File(['x'], 'a.png', { type: 'image/png' })),
    ).rejects.toThrow('File không hợp lệ');
  });
});
