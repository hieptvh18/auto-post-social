import type { ReupVideoCandidate } from '../../../infra/reup-downloader/reup-downloader.interface';
import { filterReupCandidates } from '../reup-filter';

const NOW = new Date('2026-08-15T02:00:00Z');

const makeVideo = (
  overrides: Partial<ReupVideoCandidate> = {},
): ReupVideoCandidate => ({
  externalId: 'vid-1',
  title: 'Video 1',
  authorName: 'Kênh A',
  sourceUrl: 'https://www.youtube.com/watch?v=vid-1',
  publishedAt: '2026-08-10T00:00:00Z',
  durationSec: 60,
  viewCount: 100_000,
  thumbnailUrl: null,
  ...overrides,
});

const baseCriteria = {
  knownExternalIds: new Set<string>(),
  minViewCount: 50_000,
  minDurationSec: 15,
  maxDurationSec: 180,
  maxAgeDays: 30,
  limit: 3,
  now: NOW,
};

describe('filterReupCandidates', () => {
  it('video hợp lệ ⇒ được chọn', () => {
    const result = filterReupCandidates([makeVideo()], baseCriteria);

    expect(result.picked).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  /** CHỐNG TẢI TRÙNG (QĐ-4) — không có luật này thì hôm sau tải lại y hệt. */
  it('externalId đã có trong reup_videos ⇒ LOẠI', () => {
    const result = filterReupCandidates([makeVideo({ externalId: 'cũ' })], {
      ...baseCriteria,
      knownExternalIds: new Set(['cũ']),
    });

    expect(result.picked).toHaveLength(0);
    expect(result.rejected[0].reason).toBe('ALREADY_KNOWN');
  });

  it('nguồn trả TRÙNG id trong cùng một lượt ⇒ chỉ giữ 1', () => {
    const result = filterReupCandidates(
      [makeVideo({ externalId: 'x' }), makeVideo({ externalId: 'x' })],
      baseCriteria,
    );

    expect(result.picked).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('ALREADY_KNOWN');
  });

  it('viewCount dưới ngưỡng ⇒ LOẠI', () => {
    const result = filterReupCandidates(
      [makeVideo({ viewCount: 49_999 })],
      baseCriteria,
    );

    expect(result.rejected[0].reason).toBe('LOW_VIEW');
  });

  it('viewCount đúng bằng ngưỡng ⇒ GIỮ (biên >=)', () => {
    const result = filterReupCandidates(
      [makeVideo({ viewCount: 50_000 })],
      baseCriteria,
    );

    expect(result.picked).toHaveLength(1);
  });

  describe('quy ước null ≠ 0 (plan 28)', () => {
    it('viewCount = null + có ngưỡng ⇒ LOẠI (không chứng minh được là đạt)', () => {
      const result = filterReupCandidates(
        [makeVideo({ viewCount: null })],
        baseCriteria,
      );

      expect(result.rejected[0].reason).toBe('LOW_VIEW');
    });

    it('viewCount = null + ngưỡng 0 ⇒ GIỮ', () => {
      const result = filterReupCandidates([makeVideo({ viewCount: null })], {
        ...baseCriteria,
        minViewCount: 0,
      });

      expect(result.picked).toHaveLength(1);
    });

    it('durationSec = null ⇒ LOẠI (có thể là video 3 tiếng/livestream)', () => {
      const result = filterReupCandidates(
        [makeVideo({ durationSec: null })],
        baseCriteria,
      );

      expect(result.rejected[0].reason).toBe('DURATION_OUT_OF_RANGE');
    });

    it('publishedAt = null ⇒ GIỮ (API đã lọc publishedAfter rồi)', () => {
      const result = filterReupCandidates(
        [makeVideo({ publishedAt: null })],
        baseCriteria,
      );

      expect(result.picked).toHaveLength(1);
    });
  });

  describe('thời lượng', () => {
    it.each([
      [14, 'DURATION_OUT_OF_RANGE'],
      [181, 'DURATION_OUT_OF_RANGE'],
    ])('durationSec %s ⇒ loại', (durationSec, reason) => {
      const result = filterReupCandidates(
        [makeVideo({ durationSec })],
        baseCriteria,
      );

      expect(result.rejected[0].reason).toBe(reason);
    });

    it.each([15, 180])('durationSec %s (đúng biên) ⇒ giữ', (durationSec) => {
      const result = filterReupCandidates(
        [makeVideo({ durationSec })],
        baseCriteria,
      );

      expect(result.picked).toHaveLength(1);
    });
  });

  describe('tuổi video', () => {
    it('đăng quá maxAgeDays ⇒ LOẠI', () => {
      const result = filterReupCandidates(
        [makeVideo({ publishedAt: '2026-06-01T00:00:00Z' })],
        baseCriteria,
      );

      expect(result.rejected[0].reason).toBe('TOO_OLD');
    });

    it('đăng đúng hôm nay ⇒ giữ', () => {
      const result = filterReupCandidates(
        [makeVideo({ publishedAt: '2026-08-15T01:00:00Z' })],
        baseCriteria,
      );

      expect(result.picked).toHaveLength(1);
    });

    it('publishedAt sai định dạng ⇒ giữ, không crash', () => {
      const result = filterReupCandidates(
        [makeVideo({ publishedAt: 'không-phải-ngày' })],
        baseCriteria,
      );

      expect(result.picked).toHaveLength(1);
    });
  });

  describe('xếp hạng và cắt theo dailyQuota', () => {
    const many = [
      makeVideo({ externalId: 'a', viewCount: 100_000 }),
      makeVideo({ externalId: 'b', viewCount: 900_000 }),
      makeVideo({ externalId: 'c', viewCount: 300_000 }),
      makeVideo({ externalId: 'd', viewCount: 500_000 }),
    ];

    it('lấy ĐÚNG `limit` video, nhiều view nhất trước', () => {
      const result = filterReupCandidates(many, {
        ...baseCriteria,
        limit: 2,
      });

      expect(result.picked.map((video) => video.externalId)).toEqual([
        'b',
        'd',
      ]);
    });

    it('limit lớn hơn số video còn lại ⇒ lấy hết, không lỗi', () => {
      const result = filterReupCandidates(many, {
        ...baseCriteria,
        limit: 99,
      });

      expect(result.picked).toHaveLength(4);
    });

    it('limit = 0 ⇒ mảng rỗng', () => {
      const result = filterReupCandidates(many, { ...baseCriteria, limit: 0 });

      expect(result.picked).toEqual([]);
    });
  });

  it('không có video nào ⇒ mảng rỗng, không crash', () => {
    const result = filterReupCandidates([], baseCriteria);

    expect(result.picked).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it('mọi video đều bị loại ⇒ picked rỗng, rejected đủ lý do', () => {
    const result = filterReupCandidates(
      [
        makeVideo({ externalId: 'a', viewCount: 10 }),
        makeVideo({ externalId: 'b', durationSec: 9999 }),
        makeVideo({ externalId: 'c', publishedAt: '2020-01-01T00:00:00Z' }),
      ],
      baseCriteria,
    );

    expect(result.picked).toEqual([]);
    expect(result.rejected.map((item) => item.reason)).toEqual([
      'LOW_VIEW',
      'DURATION_OUT_OF_RANGE',
      'TOO_OLD',
    ]);
  });

  it('externalId rỗng ⇒ loại với lý do MISSING_ID', () => {
    const result = filterReupCandidates(
      [makeVideo({ externalId: '' })],
      baseCriteria,
    );

    expect(result.rejected[0].reason).toBe('MISSING_ID');
  });
});
