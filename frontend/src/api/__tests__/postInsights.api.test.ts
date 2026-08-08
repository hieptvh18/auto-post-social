import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postInsightsApi } from '../postInsights.api';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('postInsightsApi', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('listPosts', () => {
    it('gọi đúng endpoint của page', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ data: [], meta: {} }));

      await postInsightsApi.listPosts('page-uuid');

      expect(String(fetchMock.mock.calls[0][0])).toContain(
        '/pages/page-uuid/insights/posts',
      );
    });

    it('đưa bộ lọc và sắp xếp vào query string', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ data: [], meta: {} }));

      await postInsightsApi.listPosts('page-uuid', {
        page: 2,
        limit: 20,
        sortBy: 'fanReach',
        sortDir: 'desc',
        mediaType: 'video',
      });

      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain('sortBy=fanReach');
      expect(url).toContain('sortDir=desc');
      expect(url).toContain('mediaType=video');
      expect(url).toContain('page=2');
    });
  });

  describe('sync', () => {
    it('gửi POST tới endpoint sync của đúng page', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ updatedCount: 3 }));

      await postInsightsApi.sync('page-uuid');

      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/pages/page-uuid/insights/sync');
      expect(init?.method).toBe('POST');
    });
  });

  describe('getSummary', () => {
    it('gọi endpoint summary', async () => {
      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(jsonResponse({ postCount: 0 }));

      await postInsightsApi.getSummary('page-uuid');

      expect(String(fetchMock.mock.calls[0][0])).toContain(
        '/pages/page-uuid/insights/summary',
      );
    });
  });
});
