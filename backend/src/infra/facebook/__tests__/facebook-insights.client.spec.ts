import type { AppConfigService } from '../../../config/app-config.service';
import { FacebookInsightsClient } from '../facebook-insights.client';
import { FacebookGraphError } from '../facebook.errors';

const config = {
  facebook: { appId: undefined, appSecret: undefined, graphVersion: 'v21.0' },
} as AppConfigService;

const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

/** Một phần tử batch thành công. Graph trả `body` là **chuỗi** JSON. */
const okEntry = (body: unknown) => ({ code: 200, body: JSON.stringify(body) });
const errorEntry = (
  code: number,
  graphCode: number,
  message: string,
  subcode?: number,
) => ({
  code,
  body: JSON.stringify({
    error: { code: graphCode, message, error_subcode: subcode },
  }),
});

/** Client luôn gửi body dạng form-urlencoded (chuỗi) — ép kiểu để đọc trong test. */
const bodyOf = (init: RequestInit): string => init.body as string;

const insightsBody = (metrics: Record<string, number>) => ({
  insights: {
    data: Object.entries(metrics).map(([name, value]) => ({
      name,
      values: [{ value }],
    })),
  },
  likes: { summary: { total_count: 7 } },
  comments: { summary: { total_count: 3 } },
  shares: { count: 2 },
});

describe('FacebookInsightsClient', () => {
  let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;
  let client: FacebookInsightsClient;

  beforeEach(() => {
    fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    client = new FacebookInsightsClient(config);
  });

  describe('getPostInsights', () => {
    it('đọc được tiếp cận, lượt nhấp và tương tác của một bài', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          okEntry(insightsBody({ post_fan_reach: 900, post_clicks: 120 })),
        ]),
      );

      const result = await client.getPostInsights(
        [{ postId: 'p_1', isVideo: false }],
        'page-token',
      );

      expect(result.failed).toEqual([]);
      expect(result.ok[0]).toEqual({
        postId: 'p_1',
        fanReach: 900,
        clicks: 120,
        videoViews: null,
        likeCount: 7,
        commentCount: 3,
        shareCount: 2,
      });
    });

    it('gửi token trong body form, KHÔNG nhét vào query string', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [okEntry(insightsBody({}))]),
      );

      await client.getPostInsights(
        [{ postId: 'p_1', isVideo: false }],
        'secret-page-token',
      );

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).not.toContain('secret-page-token');
      expect(bodyOf(init)).toContain('secret-page-token');
    });

    it('chỉ hỏi metric video cho bài video', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          okEntry(insightsBody({ post_video_views: 5000 })),
          okEntry(insightsBody({ post_clicks: 10 })),
        ]),
      );

      await client.getPostInsights(
        [
          { postId: 'v_1', isVideo: true },
          { postId: 'i_1', isVideo: false },
        ],
        'page-token',
      );

      const body = bodyOf(fetchMock.mock.calls[0][1]);
      const batch = decodeURIComponent(body);
      const [videoPart, imagePart] = batch.split('i_1');
      expect(videoPart).toContain('post_video_views');
      expect(imagePart ?? '').not.toContain('post_video_views');
    });

    // Đây là ca hỏng kinh điển của Batch API: gộp cả lô thành lỗi vì đúng 1 bài.
    it('một bài lỗi giữa lô KHÔNG làm hỏng các bài còn lại', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          okEntry(insightsBody({ post_clicks: 100 })),
          errorEntry(400, 100, 'Unsupported get request', 33),
          okEntry(insightsBody({ post_clicks: 300 })),
        ]),
      );

      const result = await client.getPostInsights(
        [
          { postId: 'p_1', isVideo: false },
          { postId: 'p_2', isVideo: false },
          { postId: 'p_3', isVideo: false },
        ],
        'page-token',
      );

      expect(result.ok.map((r) => r.postId)).toEqual(['p_1', 'p_3']);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].postId).toBe('p_2');
      expect(result.failed[0].isMissing).toBe(true);
    });

    /**
     * Ca đã xảy ra THẬT ngày 2026-08-08: Graph trả `(#100) The value must be a
     * valid insights metric` vì tên metric sai, code cũ coi 100 = "bài đã xoá"
     * ⇒ ba bài đang sống bị đóng dấu `missing_on_fb_at` vĩnh viễn.
     */
    it('code 100 do TÊN METRIC SAI không được coi là bài đã bị xoá', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          errorEntry(400, 100, 'The value must be a valid insights metric'),
        ]),
      );

      const result = await client.getPostInsights(
        [{ postId: 'p_1', isVideo: false }],
        'page-token',
      );

      expect(result.failed[0].isMissing).toBe(false);
      expect(result.failed[0].isInvalidMetric).toBe(true);
    });

    it('code 100 KHÔNG kèm subcode 33 thì không phải bài đã xoá', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [errorEntry(400, 100, 'Unsupported get request')]),
      );

      const result = await client.getPostInsights(
        [{ postId: 'p_1', isVideo: false }],
        'page-token',
      );

      expect(result.failed[0].isMissing).toBe(false);
    });

    it('lỗi rate limit KHÔNG bị coi là bài đã bị xoá', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [errorEntry(400, 4, 'Application request limit')]),
      );

      const result = await client.getPostInsights(
        [{ postId: 'p_1', isVideo: false }],
        'page-token',
      );

      expect(result.failed[0].isMissing).toBe(false);
    });

    /**
     * Metric bị Meta deprecate biến mất khỏi `data` chứ không ném lỗi. Trả 0 ở
     * đây sẽ xoá sạch số liệu cũ ở tầng repository.
     */
    it('metric vắng mặt trả null chứ không phải 0', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [okEntry({ insights: { data: [] } })]),
      );

      const result = await client.getPostInsights(
        [{ postId: 'p_1', isVideo: false }],
        'page-token',
      );

      expect(result.ok[0].fanReach).toBeNull();
      expect(result.ok[0].clicks).toBeNull();
    });

    it('phân biệt được metric trả 0 với metric vắng mặt', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [okEntry(insightsBody({ post_fan_reach: 0 }))]),
      );

      const result = await client.getPostInsights(
        [{ postId: 'p_1', isVideo: false }],
        'page-token',
      );

      expect(result.ok[0].fanReach).toBe(0);
      expect(result.ok[0].clicks).toBeNull();
    });

    it('bài chưa có lượt share (field `shares` vắng mặt) ⇒ 0, không phải lỗi', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [
          okEntry({
            insights: { data: [] },
            likes: { summary: { total_count: 1 } },
          }),
        ]),
      );

      const result = await client.getPostInsights(
        [{ postId: 'p_1', isVideo: false }],
        'page-token',
      );

      expect(result.ok[0].shareCount).toBe(0);
      expect(result.ok[0].likeCount).toBe(1);
    });

    it('chia đúng 3 lô cho 137 bài (trần batch của Graph là 50)', async () => {
      fetchMock.mockImplementation((_url, init) => {
        const body = new URLSearchParams(bodyOf(init));
        const batch = JSON.parse(body.get('batch') ?? '[]') as unknown[];
        return Promise.resolve(
          jsonResponse(
            200,
            batch.map(() => okEntry(insightsBody({ post_clicks: 1 }))),
          ),
        );
      });

      const targets = Array.from({ length: 137 }, (_, i) => ({
        postId: `p_${i}`,
        isVideo: false,
      }));

      const result = await client.getPostInsights(targets, 'page-token');

      expect(fetchMock).toHaveBeenCalledTimes(3);
      const sizes = fetchMock.mock.calls.map((call) => {
        const body = new URLSearchParams(bodyOf(call[1]));
        return (JSON.parse(body.get('batch') ?? '[]') as unknown[]).length;
      });
      expect(sizes).toEqual([50, 50, 37]);
      expect(result.ok).toHaveLength(137);
    });

    it('Graph trả thiếu phần tử ⇒ bài đó thành lỗi, không lệch thứ tự bài khác', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, [okEntry(insightsBody({ post_clicks: 10 }))]),
      );

      const result = await client.getPostInsights(
        [
          { postId: 'p_1', isVideo: false },
          { postId: 'p_2', isVideo: false },
        ],
        'page-token',
      );

      expect(result.ok.map((r) => r.postId)).toEqual(['p_1']);
      expect(result.failed[0].postId).toBe('p_2');
      expect(result.failed[0].isMissing).toBe(false);
    });

    it('ném FacebookGraphError khi cả request bị từ chối', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, { error: { code: 190, message: 'Invalid token' } }),
      );

      await expect(
        client.getPostInsights([{ postId: 'p_1', isVideo: false }], 'bad'),
      ).rejects.toBeInstanceOf(FacebookGraphError);
    });

    it('ném FacebookGraphError khi không kết nối được', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        client.getPostInsights([{ postId: 'p_1', isVideo: false }], 'token'),
      ).rejects.toBeInstanceOf(FacebookGraphError);
    });
  });
});
