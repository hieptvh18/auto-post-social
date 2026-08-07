import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../client';
import { driveImportsApi } from '../driveImports.api';
import { tokenStore } from '../tokenStore';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('driveImportsApi.inspect', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
  });

  it('POST links và trả mediaType từng dòng (để khoá checkbox gộp)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(200, {
        items: [
          { line: 1, link: 'a', ok: true, mediaType: 'image' },
          { line: 2, link: 'b', ok: true, mediaType: 'video' },
        ],
      }),
    );

    const result = await driveImportsApi.inspect(['a', 'b']);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/media/drive-imports/inspect');
    expect(JSON.parse(init?.body as string)).toEqual({ links: ['a', 'b'] });
    expect(result.items.map((item) => item.mediaType)).toEqual([
      'image',
      'video',
    ]);
  });
});

describe('driveImportsApi.create', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    tokenStore.set({ accessToken: 'acc-1', refreshToken: 'ref-1' });
  });

  it('POST đúng body: chỉ links + cờ gộp ảnh', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(202, {
        jobs: [{ id: 'job-1', source: 'DRIVE_LINK' }],
        skipped: [],
        duplicates: [],
      }),
    );

    const result = await driveImportsApi.create({
      links: ['link-a', 'link-b'],
      mergeImagesIntoOnePost: false,
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/media/drive-imports');
    expect(init?.method).toBe('POST');
    // Không double-stringify: apiRequest tự JSON.stringify body.
    expect(JSON.parse(init?.body as string)).toEqual({
      links: ['link-a', 'link-b'],
      mergeImagesIntoOnePost: false,
    });
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].source).toBe('DRIVE_LINK');
  });

  it('trả nguyên báo cáo dòng bị bỏ qua để modal hiện lý do từng dòng', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(202, {
        jobs: [{ id: 'job-1' }],
        skipped: [
          {
            line: 2,
            link: 'link-b',
            reason: 'NOT_FOUND_OR_NO_ACCESS',
            message: 'Hãy chia sẻ file cho tool-drive@example.com',
          },
        ],
        duplicates: [{ line: 1, link: 'link-a', title: 'Bài cũ' }],
      }),
    );

    const result = await driveImportsApi.create({ links: ['link-a', 'link-b'] });

    expect(result.skipped[0]).toMatchObject({
      line: 2,
      reason: 'NOT_FOUND_OR_NO_ACCESS',
    });
    expect(result.duplicates).toHaveLength(1);
  });

  it('không dòng nào dùng được ⇒ ApiError giữ nguyên message của backend', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(400, { message: 'Không nhận ra link Google Drive' }),
    );

    await expect(driveImportsApi.create({ links: ['rác'] })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
