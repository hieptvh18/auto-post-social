import { describe, expect, it, vi } from 'vitest';
import { mediaApi } from '../media.api';
import { tokenStore } from '../tokenStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(201, result));

    const file = new File(['x'], 'anh.png', { type: 'image/png' });
    const res = await mediaApi.upload(file);

    expect(res).toEqual(result);
    const [url, init] = fetchMock.mock.calls[0];
    expect(init).toBeDefined();
    const requestInit = init as RequestInit;
    expect(String(url)).toContain('/media/upload');
    expect(requestInit.method).toBe('POST');
    expect(requestInit.body).toBeInstanceOf(FormData);
    expect((requestInit.body as FormData).get('file')).toBe(file);
    // KHÔNG tự set Content-Type — để trình duyệt gắn boundary multipart.
    const headers = requestInit.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers.Authorization).toBe('Bearer acc-1');
  });
});
