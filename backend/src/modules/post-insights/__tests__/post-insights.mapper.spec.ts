import {
  toPostInsightResponse,
  toSummaryResponse,
} from '../post-insights.mapper';
import type { PostInsightRow } from '../post-insights.repository';

const row = (insight: PostInsightRow['insight']): PostInsightRow => ({
  id: 'assignment-1',
  contentAssetId: 'content-1',
  facebookPostId: '123_456',
  publishedAt: new Date('2026-08-01T03:00:00.000Z'),
  contentAsset: {
    title: 'Video quảng cáo',
    mediaType: 'video',
    thumbnailUrl: null,
  },
  insight,
});

const fullInsight: NonNullable<PostInsightRow['insight']> = {
  videoViews: 0,
  fanReach: 0,
  clicks: 0,
  likeCount: 0,
  commentCount: 0,
  shareCount: 0,
  fetchedAt: new Date('2026-08-08T10:00:00.000Z'),
  missingOnFbAt: null,
  syncErrorMessage: null,
};

describe('toPostInsightResponse', () => {
  /**
   * Ràng buộc quan trọng nhất của mapper: "chưa đo" và "đo được 0" là hai chuyện
   * khác nhau. Trộn hai cái này lại là nói với user rằng bài không ai xem.
   */
  it('bài chưa đồng bộ lần nào ⇒ số liệu là null, KHÔNG phải 0', () => {
    const result = toPostInsightResponse(row(null));

    expect(result.fanReach).toBeNull();
    expect(result.clicks).toBeNull();
    expect(result.likeCount).toBeNull();
    expect(result.fetchedAt).toBeNull();
    expect(result.missingOnFb).toBe(false);
  });

  it('bài đã đồng bộ và thật sự 0 lượt ⇒ trả 0, không phải null', () => {
    const result = toPostInsightResponse(row(fullInsight));

    expect(result.fanReach).toBe(0);
    expect(result.likeCount).toBe(0);
    expect(result.fetchedAt).toEqual(fullInsight.fetchedAt);
  });

  it('bài đã bị xoá trên Facebook ⇒ missingOnFb = true', () => {
    const result = toPostInsightResponse(
      row({ ...fullInsight, missingOnFbAt: new Date() }),
    );

    expect(result.missingOnFb).toBe(true);
  });

  it('dựng link tới đúng bài trên Facebook', () => {
    expect(toPostInsightResponse(row(null)).facebookPostUrl).toBe(
      'https://www.facebook.com/123_456',
    );
  });
});

describe('toSummaryResponse', () => {
  /**
   * Chia cho tổng số bài (kể cả bài chưa đo) sẽ pha loãng ra một con số thấp
   * giả tạo — user sẽ tưởng page đang tụt tương tác.
   */
  it('trung bình tính trên bài ĐÃ đo, không phải tổng số bài', () => {
    const result = toSummaryResponse({
      postCount: 10,
      syncedCount: 4,
      totalVideoViews: 0,
      totalFanReach: 800,
      totalClicks: 1000,
      lastFetchedAt: null,
    });

    expect(result.averageClicks).toBe(250);
  });

  it('chưa đo bài nào ⇒ trung bình 0, không chia cho 0', () => {
    const result = toSummaryResponse({
      postCount: 5,
      syncedCount: 0,
      totalVideoViews: 0,
      totalFanReach: 0,
      totalClicks: 0,
      lastFetchedAt: null,
    });

    expect(result.averageClicks).toBe(0);
  });
});
