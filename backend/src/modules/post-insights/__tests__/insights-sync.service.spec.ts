import type { AppConfigService } from '../../../config/app-config.service';
import type { CryptoService } from '../../../infra/crypto/crypto.service';
import { FacebookGraphError } from '../../../infra/facebook/facebook.errors';
import type { FacebookInsightsClient } from '../../../infra/facebook/facebook-insights.client';
import type { FacebookInsightsResult } from '../../../infra/facebook/facebook-insights.interface';
import { InsightsSyncService, isDue } from '../insights-sync.service';
import type {
  PostInsightsRepository,
  SyncPageTarget,
  SyncTarget,
} from '../post-insights.repository';

const NOW = new Date('2026-08-08T10:00:00.000Z');
const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const hoursAgo = (h: number): Date => new Date(NOW.getTime() - h * MS_PER_HOUR);
const daysAgo = (d: number): Date => new Date(NOW.getTime() - d * MS_PER_DAY);

const target = (over: Partial<SyncTarget> = {}): SyncTarget => ({
  assignmentId: 'a1',
  facebookPostId: 'page_1_post_1',
  publishedAt: hoursAgo(1),
  isVideo: false,
  fetchedAt: null,
  ...over,
});

const pageTarget = (over: Partial<SyncPageTarget> = {}): SyncPageTarget => ({
  pageId: 'page-uuid',
  pageName: 'Luca Page',
  accessTokenEnc: 'enc-token',
  connectionScopes: ['pages_manage_posts', 'read_insights'],
  posts: [target()],
  ...over,
});

const emptyGraphResult: FacebookInsightsResult = { ok: [], failed: [] };

describe('isDue', () => {
  it('bài chưa đồng bộ lần nào ⇒ luôn tới hạn', () => {
    expect(isDue(target({ fetchedAt: null }), NOW)).toBe(true);
  });

  describe('bài dưới 48 giờ — quét mỗi 6 giờ', () => {
    it('đồng bộ cách đây 7 giờ ⇒ tới hạn', () => {
      const post = target({
        publishedAt: hoursAgo(10),
        fetchedAt: hoursAgo(7),
      });
      expect(isDue(post, NOW)).toBe(true);
    });

    it('đồng bộ cách đây 2 giờ ⇒ chưa tới hạn', () => {
      const post = target({
        publishedAt: hoursAgo(10),
        fetchedAt: hoursAgo(2),
      });
      expect(isDue(post, NOW)).toBe(false);
    });
  });

  describe('bài 2–7 ngày — quét mỗi 24 giờ', () => {
    it('đồng bộ cách đây 7 giờ ⇒ CHƯA tới hạn (khác hẳn bài mới)', () => {
      const post = target({ publishedAt: daysAgo(3), fetchedAt: hoursAgo(7) });
      expect(isDue(post, NOW)).toBe(false);
    });

    it('đồng bộ cách đây 25 giờ ⇒ tới hạn', () => {
      const post = target({ publishedAt: daysAgo(3), fetchedAt: hoursAgo(25) });
      expect(isDue(post, NOW)).toBe(true);
    });
  });

  describe('bài 8–30 ngày — quét mỗi 48 giờ', () => {
    it('đồng bộ cách đây 25 giờ ⇒ chưa tới hạn', () => {
      const post = target({
        publishedAt: daysAgo(20),
        fetchedAt: hoursAgo(25),
      });
      expect(isDue(post, NOW)).toBe(false);
    });

    it('đồng bộ cách đây 50 giờ ⇒ tới hạn', () => {
      const post = target({
        publishedAt: daysAgo(20),
        fetchedAt: hoursAgo(50),
      });
      expect(isDue(post, NOW)).toBe(true);
    });
  });

  it('bài quá 30 ngày ⇒ ngừng hẳn, dù đồng bộ lần cuối đã rất lâu', () => {
    const post = target({ publishedAt: daysAgo(40), fetchedAt: daysAgo(10) });
    expect(isDue(post, NOW)).toBe(false);
  });
});

describe('InsightsSyncService', () => {
  let repository: jest.Mocked<
    Pick<
      PostInsightsRepository,
      'findSyncCandidates' | 'saveInsight' | 'markMissing' | 'recordSyncError'
    >
  >;
  let insights: jest.Mocked<Pick<FacebookInsightsClient, 'getPostInsights'>>;
  let crypto: jest.Mocked<Pick<CryptoService, 'decrypt'>>;
  let service: InsightsSyncService;

  beforeEach(() => {
    repository = {
      findSyncCandidates: jest.fn().mockResolvedValue([]),
      saveInsight: jest.fn().mockResolvedValue(undefined),
      markMissing: jest.fn().mockResolvedValue(undefined),
      recordSyncError: jest.fn().mockResolvedValue(undefined),
    };
    insights = {
      getPostInsights: jest.fn().mockResolvedValue(emptyGraphResult),
    };
    crypto = { decrypt: jest.fn().mockReturnValue('plain-token') };

    service = new InsightsSyncService(
      repository as unknown as PostInsightsRepository,
      insights as unknown as FacebookInsightsClient,
      crypto as unknown as CryptoService,
      { now: () => NOW },
      { timezone: 'Asia/Ho_Chi_Minh' } as AppConfigService,
    );
  });

  describe('syncAll', () => {
    it('chỉ theo dõi bài trong 30 ngày gần nhất', async () => {
      await service.syncAll(NOW);

      const [windowStart] = repository.findSyncCandidates.mock.calls[0];
      expect(windowStart).toEqual(daysAgo(30));
    });

    it('lưu số liệu lấy được kèm ảnh chụp theo ngày Asia/Ho_Chi_Minh', async () => {
      repository.findSyncCandidates.mockResolvedValue([pageTarget()]);
      insights.getPostInsights.mockResolvedValue({
        ok: [
          {
            postId: 'page_1_post_1',
            fanReach: 400,
            clicks: 500,
            videoViews: null,
            likeCount: 10,
            commentCount: 2,
            shareCount: 1,
          },
        ],
        failed: [],
      });

      const [result] = await service.syncAll(NOW);

      expect(result.updatedCount).toBe(1);
      const [data, snapshotDate] = repository.saveInsight.mock.calls[0];
      expect(data.clicks).toBe(500);
      expect(data.fetchedAt).toEqual(NOW);
      // 10:00 UTC = 17:00 giờ Việt Nam ⇒ vẫn là ngày 08.
      expect(snapshotDate).toBe('2026-08-08');
    });

    // Không có test này thì mỗi lần Meta đổi tên metric là toàn bộ số về 0.
    it('metric vắng mặt (null) được chuyển nguyên xuống repository, không hoá 0', async () => {
      repository.findSyncCandidates.mockResolvedValue([pageTarget()]);
      insights.getPostInsights.mockResolvedValue({
        ok: [
          {
            postId: 'page_1_post_1',
            fanReach: null,
            clicks: null,
            videoViews: null,
            likeCount: 0,
            commentCount: 0,
            shareCount: 0,
          },
        ],
        failed: [],
      });

      await service.syncAll(NOW);

      const [data] = repository.saveInsight.mock.calls[0];
      expect(data.fanReach).toBeNull();
      expect(data.clicks).toBeNull();
    });

    it('bài đã bị xoá trên FB ⇒ markMissing, không phải recordSyncError', async () => {
      repository.findSyncCandidates.mockResolvedValue([pageTarget()]);
      insights.getPostInsights.mockResolvedValue({
        ok: [],
        failed: [
          {
            postId: 'page_1_post_1',
            isMissing: true,
            isInvalidMetric: false,
            message: 'Bài này không còn tồn tại trên Facebook.',
          },
        ],
      });

      const [result] = await service.syncAll(NOW);

      expect(repository.markMissing).toHaveBeenCalledWith(
        'a1',
        'page_1_post_1',
        'Bài này không còn tồn tại trên Facebook.',
        NOW,
      );
      expect(repository.recordSyncError).not.toHaveBeenCalled();
      expect(result.missingCount).toBe(1);
      expect(result.failedCount).toBe(0);
    });

    it('lỗi tạm (rate limit) ⇒ recordSyncError, KHÔNG đánh dấu bài đã xoá', async () => {
      repository.findSyncCandidates.mockResolvedValue([pageTarget()]);
      insights.getPostInsights.mockResolvedValue({
        ok: [],
        failed: [
          {
            postId: 'page_1_post_1',
            isMissing: false,
            isInvalidMetric: false,
            message: 'rate limit',
          },
        ],
      });

      const [result] = await service.syncAll(NOW);

      expect(repository.markMissing).not.toHaveBeenCalled();
      expect(repository.recordSyncError).toHaveBeenCalled();
      expect(result.failedCount).toBe(1);
    });

    /**
     * Tên metric sai là lỗi cấu hình của ta, không phải của bài. Ghi lỗi lên
     * từng dòng chỉ tạo 50 message giống nhau che mất nguyên nhân thật.
     */
    it('Graph chê TÊN METRIC ⇒ dừng cả page, không ghi lỗi lên từng bài', async () => {
      repository.findSyncCandidates.mockResolvedValue([pageTarget()]);
      insights.getPostInsights.mockResolvedValue({
        ok: [],
        failed: [
          {
            postId: 'page_1_post_1',
            isMissing: false,
            isInvalidMetric: true,
            message: 'The value must be a valid insights metric',
          },
        ],
      });

      const [result] = await service.syncAll(NOW);

      expect(result.skipReason).toBe('INVALID_METRIC');
      expect(repository.recordSyncError).not.toHaveBeenCalled();
      expect(repository.markMissing).not.toHaveBeenCalled();
    });

    it('token thiếu scope read_insights ⇒ bỏ cả page, KHÔNG gọi Graph lần nào', async () => {
      repository.findSyncCandidates.mockResolvedValue([
        pageTarget({ connectionScopes: ['pages_manage_posts'] }),
      ]);

      const [result] = await service.syncAll(NOW);

      expect(insights.getPostInsights).not.toHaveBeenCalled();
      expect(result.skipReason).toBe('MISSING_SCOPE');
    });

    it('page dán token tay (không biết scope) vẫn được thử — không chặn oan', async () => {
      repository.findSyncCandidates.mockResolvedValue([
        pageTarget({ connectionScopes: null }),
      ]);

      await service.syncAll(NOW);

      expect(insights.getPostInsights).toHaveBeenCalled();
    });

    it('không giải mã được token ⇒ bỏ page đó, không ném lỗi ra ngoài', async () => {
      repository.findSyncCandidates.mockResolvedValue([pageTarget()]);
      crypto.decrypt.mockImplementation(() => {
        throw new Error('sai key');
      });

      const [result] = await service.syncAll(NOW);

      expect(result.skipReason).toBe('TOKEN_UNREADABLE');
      expect(insights.getPostInsights).not.toHaveBeenCalled();
    });

    it('một page lỗi không làm chết page còn lại', async () => {
      repository.findSyncCandidates.mockResolvedValue([
        pageTarget({ pageId: 'page-1' }),
        pageTarget({ pageId: 'page-2' }),
      ]);
      insights.getPostInsights
        .mockRejectedValueOnce(new FacebookGraphError('mất mạng'))
        .mockResolvedValueOnce(emptyGraphResult);

      const results = await service.syncAll(NOW);

      expect(results).toHaveLength(2);
      expect(results[0].failedCount).toBe(1);
      expect(results[1].pageId).toBe('page-2');
    });

    it('chỉ gửi lên Graph những bài tới hạn', async () => {
      repository.findSyncCandidates.mockResolvedValue([
        pageTarget({
          posts: [
            target({ assignmentId: 'due', facebookPostId: 'p_due' }),
            target({
              assignmentId: 'not-due',
              facebookPostId: 'p_not_due',
              publishedAt: hoursAgo(10),
              fetchedAt: hoursAgo(1),
            }),
          ],
        }),
      ]);

      const [result] = await service.syncAll(NOW);

      const [targets] = insights.getPostInsights.mock.calls[0];
      expect(targets).toEqual([{ postId: 'p_due', isVideo: false }]);
      expect(result.dueCount).toBe(1);
    });

    it('không bài nào tới hạn ⇒ không gọi Graph', async () => {
      repository.findSyncCandidates.mockResolvedValue([
        pageTarget({
          posts: [
            target({ publishedAt: hoursAgo(10), fetchedAt: hoursAgo(1) }),
          ],
        }),
      ]);

      const [result] = await service.syncAll(NOW);

      expect(insights.getPostInsights).not.toHaveBeenCalled();
      expect(result.skipReason).toBe('NO_DUE_POSTS');
    });
  });

  describe('syncPageOnDemand', () => {
    it('gọi lần đầu chạy được', async () => {
      const result = await service.syncPageOnDemand('page-uuid');
      expect(result).not.toBeNull();
    });

    it('gọi lại ngay lập tức ⇒ trả null (đang bị throttle)', async () => {
      await service.syncPageOnDemand('page-uuid');
      expect(await service.syncPageOnDemand('page-uuid')).toBeNull();
    });

    it('throttle tính riêng từng page', async () => {
      await service.syncPageOnDemand('page-a');
      expect(await service.syncPageOnDemand('page-b')).not.toBeNull();
    });

    it('chỉ đồng bộ đúng page được yêu cầu', async () => {
      await service.syncPageOnDemand('page-uuid');

      const [, pageId] = repository.findSyncCandidates.mock.calls[0];
      expect(pageId).toBe('page-uuid');
    });
  });
});
