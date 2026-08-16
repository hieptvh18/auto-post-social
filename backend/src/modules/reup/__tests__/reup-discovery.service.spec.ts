import {
  ReupPlatform,
  ReupRunStatus,
  type ReupTopic,
} from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import {
  DownloaderUnavailableError,
  YoutubeQuotaExceededError,
} from '../../../infra/reup-downloader/reup-downloader.errors';
import { AuditAction, type AuditService } from '../../audit/audit.service';
import type { SettingsService } from '../../settings/settings.service';
import { ReupDiscoveryService } from '../reup-discovery.service';
import {
  ReupSkipReason,
  type ReupRunsRepository,
} from '../reup-runs.repository';
import type { ReupTopicsRepository } from '../reup-topics.repository';
import type { ReupVideosRepository } from '../reup-videos.repository';

const NOW = new Date('2026-08-15T02:00:00Z');
const RUN_DATE = '2026-08-15';
const RUN_ID = 'run-1';

const makeTopic = (overrides: Partial<ReupTopic> = {}): ReupTopic => ({
  id: 'topic-1',
  name: 'Mẹo nấu ăn',
  platform: ReupPlatform.YOUTUBE,
  keywords: ['mẹo nấu ăn'],
  regionCode: 'VN',
  category: 'Ẩm thực',
  dailyQuota: 2,
  minViewCount: 50_000,
  maxAgeDays: 30,
  minDurationSec: 15,
  maxDurationSec: 180,
  autoApprove: false,
  captionTemplate: null,
  hashtags: null,
  isActive: true,
  createdById: 'super-1',
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeCandidate = (id: string, viewCount = 100_000) => ({
  externalId: id,
  title: `Video ${id}`,
  authorName: 'Kênh A',
  sourceUrl: `https://www.youtube.com/watch?v=${id}`,
  publishedAt: '2026-08-14T00:00:00Z',
  durationSec: 60,
  viewCount,
  thumbnailUrl: null,
});

describe('ReupDiscoveryService', () => {
  let topics: { findActive: jest.Mock; findById: jest.Mock };
  let videos: {
    findKnownExternalIds: jest.Mock;
    createMany: jest.Mock;
    findByExternalIds: jest.Mock;
  };
  let runs: {
    claim: jest.Mock;
    finish: jest.Mock;
    sumQuotaUsedOnDate: jest.Mock;
    findByRunDate: jest.Mock;
  };
  let settings: {
    getYoutubeApiKey: jest.Mock;
    getYoutubeDailyQuota: jest.Mock;
  };
  let downloader: {
    search: jest.Mock;
    download: jest.Mock;
    checkAvailability: jest.Mock;
  };
  let queue: { add: jest.Mock };
  let auditService: { log: jest.Mock };
  let service: ReupDiscoveryService;

  beforeEach(() => {
    topics = {
      findActive: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
    };
    videos = {
      findKnownExternalIds: jest.fn().mockResolvedValue(new Set<string>()),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findByExternalIds: jest.fn().mockResolvedValue([]),
    };
    runs = {
      claim: jest.fn().mockResolvedValue({ id: RUN_ID }),
      finish: jest.fn().mockResolvedValue(undefined),
      sumQuotaUsedOnDate: jest.fn().mockResolvedValue(0),
      findByRunDate: jest.fn().mockResolvedValue([]),
    };
    settings = {
      getYoutubeApiKey: jest.fn().mockResolvedValue('key-1234'),
      getYoutubeDailyQuota: jest.fn().mockResolvedValue(10_000),
    };
    downloader = {
      search: jest.fn().mockResolvedValue([]),
      download: jest.fn(),
      checkAvailability: jest.fn().mockResolvedValue({ available: true }),
    };
    queue = { add: jest.fn().mockResolvedValue(undefined) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ReupDiscoveryService(
      topics as unknown as ReupTopicsRepository,
      videos as unknown as ReupVideosRepository,
      runs as unknown as ReupRunsRepository,
      settings as unknown as SettingsService,
      { timezone: 'Asia/Ho_Chi_Minh' } as unknown as AppConfigService,
      { now: () => NOW },
      auditService as unknown as AuditService,
      downloader,
      queue as unknown as never,
    );
  });

  /** Lấy đối số `finish` để khẳng định lượt quét được đóng sổ đúng lý do. */
  const finishArg = (): { status: string; skipReason?: string | null } => {
    const calls = runs.finish.mock.calls as unknown[][];
    return calls[0][1] as { status: string; skipReason?: string | null };
  };

  describe('chống double-fire (ADR-006)', () => {
    it('claim trả null (đã quét hôm nay) ⇒ KHÔNG gọi port, KHÔNG tạo video', async () => {
      runs.claim.mockResolvedValue(null);

      const result = await service.discoverTopic(makeTopic(), null);

      expect(result.claimed).toBe(false);
      expect(downloader.search).not.toHaveBeenCalled();
      expect(videos.createMany).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('claim đúng (topicId, runDate) theo giờ Việt Nam', async () => {
      await service.discoverTopic(makeTopic(), null);

      expect(runs.claim).toHaveBeenCalledWith('topic-1', RUN_DATE);
    });

    it('gọi 2 lần: lần đầu quét, lần sau bị claim chặn ⇒ chỉ 1 lượt tạo video', async () => {
      downloader.search.mockResolvedValue([makeCandidate('a')]);
      videos.findByExternalIds.mockResolvedValue([
        { id: 'v1', topicId: 'topic-1', externalId: 'a' },
      ]);

      await service.discoverTopic(makeTopic(), null);
      runs.claim.mockResolvedValue(null); // DB chặn lần thứ hai
      await service.discoverTopic(makeTopic(), null);

      expect(videos.createMany).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledTimes(1);
    });
  });

  describe('các cửa chặn — đóng sổ SKIPPED, KHÔNG gọi API', () => {
    it('platform = DOUYIN ⇒ SKIPPED/PLATFORM_NOT_SUPPORTED', async () => {
      const result = await service.discoverTopic(
        makeTopic({ platform: ReupPlatform.DOUYIN }),
        null,
      );

      expect(result.skipReason).toBe(ReupSkipReason.PLATFORM_NOT_SUPPORTED);
      expect(downloader.search).not.toHaveBeenCalled();
      expect(finishArg().status).toBe(ReupRunStatus.SKIPPED);
    });

    it('downloader vắng mặt ⇒ SKIPPED/DOWNLOADER_UNAVAILABLE, KHÔNG ném lỗi', async () => {
      downloader.checkAvailability.mockResolvedValue({
        available: false,
        reason: 'chưa cấu hình REUP_PYTHON_BIN',
      });

      const result = await service.discoverTopic(makeTopic(), null);

      expect(result.skipReason).toBe(ReupSkipReason.DOWNLOADER_UNAVAILABLE);
      expect(result.status).toBe(ReupRunStatus.SKIPPED);
      expect(downloader.search).not.toHaveBeenCalled();
    });

    it('chưa cấu hình API key ⇒ SKIPPED/NOT_CONFIGURED, KHÔNG gọi port', async () => {
      settings.getYoutubeApiKey.mockResolvedValue(null);

      const result = await service.discoverTopic(makeTopic(), null);

      expect(result.skipReason).toBe(ReupSkipReason.NOT_CONFIGURED);
      expect(downloader.search).not.toHaveBeenCalled();
    });

    it('quota đã vượt ⇒ SKIPPED/QUOTA_EXCEEDED, KHÔNG gọi port', async () => {
      runs.sumQuotaUsedOnDate.mockResolvedValue(9_999);
      settings.getYoutubeDailyQuota.mockResolvedValue(10_000);

      const result = await service.discoverTopic(makeTopic(), null);

      expect(result.skipReason).toBe(ReupSkipReason.QUOTA_EXCEEDED);
      expect(downloader.search).not.toHaveBeenCalled();
    });

    it('quota còn vừa đủ ⇒ VẪN quét', async () => {
      runs.sumQuotaUsedOnDate.mockResolvedValue(0);
      settings.getYoutubeDailyQuota.mockResolvedValue(101);

      await service.discoverTopic(makeTopic(), null);

      expect(downloader.search).toHaveBeenCalled();
    });

    it('không có video mới ⇒ SKIPPED/NO_NEW_VIDEO', async () => {
      downloader.search.mockResolvedValue([]);

      const result = await service.discoverTopic(makeTopic(), null);

      expect(result.skipReason).toBe(ReupSkipReason.NO_NEW_VIDEO);
      expect(videos.createMany).not.toHaveBeenCalled();
    });

    it('mọi video đều đã tải trước đó ⇒ SKIPPED/NO_NEW_VIDEO (chống trùng)', async () => {
      downloader.search.mockResolvedValue([makeCandidate('cũ')]);
      videos.findKnownExternalIds.mockResolvedValue(new Set(['cũ']));

      const result = await service.discoverTopic(makeTopic(), null);

      expect(result.skipReason).toBe(ReupSkipReason.NO_NEW_VIDEO);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('lỗi từ port ⇒ SKIPPED có lý do, KHÔNG ném ra ngoài module (QĐ-6)', () => {
    it.each([
      [
        new DownloaderUnavailableError('gỡ thư mục'),
        ReupSkipReason.DOWNLOADER_UNAVAILABLE,
      ],
      [
        new YoutubeQuotaExceededError('hết quota'),
        ReupSkipReason.QUOTA_EXCEEDED,
      ],
    ])('%s ⇒ %s', async (error, expectedReason) => {
      downloader.search.mockRejectedValue(error);

      const result = await service.discoverTopic(makeTopic(), null);

      expect(result.skipReason).toBe(expectedReason);
      expect(result.status).toBe(ReupRunStatus.SKIPPED);
    });

    it('lỗi lạ ⇒ đóng sổ ERROR, vẫn KHÔNG ném ra ngoài', async () => {
      downloader.search.mockRejectedValue(new Error('mạng chết'));

      const result = await service.discoverTopic(makeTopic(), null);

      expect(result.status).toBe(ReupRunStatus.ERROR);
    });

    it('discoverAll: 1 chủ đề lỗi KHÔNG chặn chủ đề còn lại', async () => {
      topics.findActive.mockResolvedValue([
        makeTopic({ id: 'topic-1' }),
        makeTopic({ id: 'topic-2', name: 'Chủ đề 2' }),
      ]);
      downloader.search
        .mockRejectedValueOnce(new Error('hỏng'))
        .mockResolvedValue([makeCandidate('b')]);
      videos.findByExternalIds.mockResolvedValue([
        { id: 'v2', topicId: 'topic-2', externalId: 'b' },
      ]);

      const results = await service.discoverAll(null);

      expect(results).toHaveLength(2);
      expect(results[0].status).toBe(ReupRunStatus.ERROR);
      expect(results[1].status).toBe(ReupRunStatus.DONE);
    });
  });

  describe('luồng thành công', () => {
    beforeEach(() => {
      downloader.search.mockResolvedValue([
        makeCandidate('a', 900_000),
        makeCandidate('b', 500_000),
        makeCandidate('c', 100_000),
      ]);
      videos.findByExternalIds.mockResolvedValue([
        { id: 'v-a', topicId: 'topic-1', externalId: 'a' },
        { id: 'v-b', topicId: 'topic-1', externalId: 'b' },
      ]);
    });

    it('lấy đúng dailyQuota video, nhiều view nhất trước', async () => {
      await service.discoverTopic(makeTopic({ dailyQuota: 2 }), null);

      const calls = videos.createMany.mock.calls as unknown[][];
      const created = calls[0][0] as { externalId: string }[];
      expect(created.map((video) => video.externalId)).toEqual(['a', 'b']);
    });

    it('đẩy mỗi video vào hàng đợi reup-download đúng 1 lần', async () => {
      await service.discoverTopic(makeTopic(), null);

      expect(queue.add).toHaveBeenCalledTimes(2);
    });

    it('đóng sổ DONE kèm số tìm được / số chọn', async () => {
      const result = await service.discoverTopic(makeTopic(), null);

      expect(result.status).toBe(ReupRunStatus.DONE);
      expect(result.foundCount).toBe(3);
      expect(result.pickedCount).toBe(2);
    });

    it('cron (actorId = null) ⇒ audit REUP_DISCOVER_CRON, actor Bot', async () => {
      await service.discoverTopic(makeTopic(), null);

      const payload = (auditService.log.mock.calls as unknown[][])[0][0] as {
        userId: string | null;
        action: string;
      };
      expect(payload.userId).toBeNull();
      expect(payload.action).toBe(AuditAction.REUP_DISCOVER_CRON);
    });

    it('bấm tay (có actorId) ⇒ audit REUP_DISCOVER_MANUAL', async () => {
      await service.discoverTopic(makeTopic(), 'super-1');

      const payload = (auditService.log.mock.calls as unknown[][])[0][0] as {
        userId: string | null;
        action: string;
      };
      expect(payload.userId).toBe('super-1');
      expect(payload.action).toBe(AuditAction.REUP_DISCOVER_MANUAL);
    });

    it('audit payload KHÔNG chứa API key', async () => {
      await service.discoverTopic(makeTopic(), null);

      const serialized = JSON.stringify(auditService.log.mock.calls);
      expect(serialized).not.toContain('key-1234');
    });
  });

  it('không có chủ đề nào đang bật ⇒ không làm gì', async () => {
    topics.findActive.mockResolvedValue([]);

    await expect(service.discoverAll(null)).resolves.toEqual([]);
    expect(runs.claim).not.toHaveBeenCalled();
  });
});
