import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, setOnAuthExpired } from '../client';
import { tokenStore } from '../tokenStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiRequest', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    setOnAuthExpired(() => {});
  });

  it('gắn Bearer token vào header khi đã có access token', async () => {
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, { ok: true }));

    await apiRequest('/pages');

    const [, init] = fetchMock.mock.calls[0];
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer acc-1');
  });

  it('không gắn Bearer khi skipAuth = true', async () => {
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/auth/login', { method: 'POST', skipAuth: true });

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('map lỗi backend thành ApiError với statusCode và message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(409, { statusCode: 409, message: 'Trùng page', error: 'Conflict' }),
    );

    await expect(apiRequest('/pages', { method: 'POST' })).rejects.toMatchObject({
      statusCode: 409,
      message: 'Trùng page',
    });
  });

  it('gộp message mảng (lỗi validate) thành 1 chuỗi, giữ mảng ở messages', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { statusCode: 400, message: ['email sai', 'thiếu mật khẩu'] }),
    );

    try {
      await apiRequest('/auth/login', { method: 'POST', skipAuth: true });
      expect.unreachable('phải ném ApiError');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.messages).toEqual(['email sai', 'thiếu mật khẩu']);
      expect(apiErr.message).toBe('email sai; thiếu mật khẩu');
    }
  });

  it('khi 401 thì refresh MỘT lần rồi retry request thành công', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'ref-1' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      // 1) request đầu → 401
      .mockResolvedValueOnce(jsonResponse(401, { message: 'hết hạn' }))
      // 2) /auth/refresh → cặp token mới
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-acc', refreshToken: 'new-ref' }),
      )
      // 3) retry request → 200
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const result = await apiRequest<{ ok: boolean }>('/pages');

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Token đã được thay bằng cặp mới, retry dùng token mới.
    expect(tokenStore.access).toBe('new-acc');
    const retryHeaders = fetchMock.mock.calls[2][1]?.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe('Bearer new-acc');
  });

  it('refresh thất bại ⇒ dọn token, gọi onAuthExpired, ném ApiError 401', async () => {
    tokenStore.set({ accessToken: 'old', refreshToken: 'ref-bad' });
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { message: 'hết hạn' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'refresh sai' }));
    const onExpired = vi.fn();
    setOnAuthExpired(onExpired);

    await expect(apiRequest('/pages')).rejects.toMatchObject({ statusCode: 401 });
    expect(tokenStore.access).toBeNull();
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('không refresh khi request là skipAuth (login sai ⇒ ném 401 luôn)', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(401, { message: 'sai mật khẩu' }));

    await expect(
      apiRequest('/auth/login', { method: 'POST', skipAuth: true }),
    ).rejects.toMatchObject({ statusCode: 401 });
    // Chỉ gọi 1 lần — không thử refresh.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('trả undefined cho response 204 (No Content)', async () => {
    tokenStore.set({ accessToken: 'acc', refreshToken: 'ref' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    const result = await apiRequest('/pages/x', { method: 'DELETE' });
    expect(result).toBeUndefined();
  });

  describe('lỗi không phải JSON (413 từ Nginx/proxy đứng trước backend)', () => {
    /** HTTP/2 bỏ hẳn reason phrase ⇒ statusText luôn rỗng, khác HTTP/1.1. */
    function htmlErrorResponse(status: number, statusText = ''): Response {
      return new Response('<html><body>413 Request Entity Too Large</body></html>', {
        status,
        statusText,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    it('413 dạng HTML (statusText rỗng, kiểu HTTP/2) ⇒ báo rõ nguyên nhân file quá lớn', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlErrorResponse(413));

      await expect(apiRequest('/media/upload', { method: 'POST' })).rejects.toMatchObject({
        statusCode: 413,
        message: expect.stringContaining('quá lớn'),
      });
    });

    it('413 dạng HTML nhưng statusText có sẵn (HTTP/1.1) vẫn ưu tiên message cụ thể', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        htmlErrorResponse(413, 'Request Entity Too Large'),
      );

      await expect(apiRequest('/media/upload', { method: 'POST' })).rejects.toMatchObject({
        statusCode: 413,
        message: expect.stringContaining('quá lớn'),
      });
    });

    it('504 dạng HTML ⇒ báo timeout thay vì chung chung', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlErrorResponse(504));

      await expect(apiRequest('/media/upload', { method: 'POST' })).rejects.toMatchObject({
        statusCode: 504,
        message: expect.stringContaining('504'),
      });
    });

    it('mã lỗi lạ, không JSON, không statusText ⇒ vẫn kèm mã lỗi thay vì mù mờ hoàn toàn', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(htmlErrorResponse(418));

      await expect(apiRequest('/media/upload', { method: 'POST' })).rejects.toMatchObject({
        statusCode: 418,
        message: 'Lỗi không xác định (mã 418)',
      });
    });
  });
});
