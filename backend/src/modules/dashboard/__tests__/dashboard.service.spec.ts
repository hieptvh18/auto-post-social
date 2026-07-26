import { ForbiddenException } from '@nestjs/common';
import {
  SlotRunStatus,
  UserRole,
  type SlotRun,
} from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AppConfigService } from '../../../config/app-config.service';
import type { AutoPostConfigResponse } from '../../auto-post-configs/auto-post-config.mapper';
import type { AutoPostConfigsService } from '../../auto-post-configs/auto-post-configs.service';
import type { SlotRunService } from '../../auto-post/slot-run.service';
import type { MonitorService } from '../../monitor/monitor.service';
import { DashboardRepository } from '../dashboard.repository';
import { DashboardService } from '../dashboard.service';
import { DashboardMediaType } from '../dto/query-dashboard.dto';

const TZ = 'Asia/Ho_Chi_Minh';
const NOW = new Date('2026-07-25T03:00:00Z'); // 10:00 giờ VN

const ADMIN: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Quản trị',
  role: UserRole.ADMIN,
};
const EDITOR: AuthenticatedUser = {
  ...ADMIN,
  id: 'editor-1',
  role: UserRole.EDITOR,
};
const CONTENT: AuthenticatedUser = {
  ...ADMIN,
  id: 'content-1',
  role: UserRole.CONTENT,
};

type RepositoryMock = jest.Mocked<
  Pick<
    DashboardRepository,
    | 'countContentInventory'
    | 'countNewContent'
    | 'countAdsVideos'
    | 'countJobVolume'
    | 'countInFlightJobs'
    | 'countPages'
    | 'countActiveUsers'
    | 'dailyJobStats'
    | 'postsByPage'
    | 'findPagesWithExpiringToken'
  >
>;

interface Mocks {
  repository: RepositoryMock;
  monitor: { getQueueSummary: jest.Mock };
  autoPostConfigs: { findAllConfigs: jest.Mock };
  slotRuns: { findByRunDate: jest.Mock };
  service: DashboardService;
}

function setup(): Mocks {
  const repository: RepositoryMock = {
    countContentInventory: jest.fn().mockResolvedValue({
      pendingReview: 5,
      approved: 12,
      rejected: 2,
      approvedUnassigned: 4,
    }),
    countNewContent: jest.fn().mockResolvedValue(20),
    countAdsVideos: jest.fn().mockResolvedValue(8),
    countJobVolume: jest.fn().mockResolvedValue({ success: 140, failed: 3 }),
    countInFlightJobs: jest.fn().mockResolvedValue(1),
    countPages: jest
      .fn()
      .mockResolvedValue({ activePages: 3, autopostEnabledPages: 2 }),
    countActiveUsers: jest.fn().mockResolvedValue(4),
    dailyJobStats: jest.fn().mockResolvedValue([]),
    postsByPage: jest.fn().mockResolvedValue([]),
    findPagesWithExpiringToken: jest.fn().mockResolvedValue([]),
  };

  const monitor = {
    getQueueSummary: jest.fn().mockResolvedValue({
      stuck: [],
      stuckThresholdMinutes: 15,
    }),
  };
  const autoPostConfigs = { findAllConfigs: jest.fn().mockResolvedValue([]) };
  const slotRuns = { findByRunDate: jest.fn().mockResolvedValue([]) };

  const service = new DashboardService(
    repository as unknown as DashboardRepository,
    monitor as unknown as MonitorService,
    autoPostConfigs as unknown as AutoPostConfigsService,
    slotRuns as unknown as SlotRunService,
    { now: () => NOW },
    { timezone: TZ } as AppConfigService,
  );

  return { repository, monitor, autoPostConfigs, slotRuns, service };
}

const makeConfig = (
  overrides: Partial<AutoPostConfigResponse> = {},
): AutoPostConfigResponse =>
  ({
    pageId: 'page-1',
    pageName: 'Cửa hàng cây cảnh',
    facebookPageId: '123',
    enabled: true,
    isActive: true,
    slots: [{ id: 'slot-1', enabled: true, readyCount: 0 }],
    ...overrides,
  }) as AutoPostConfigResponse;

const makeRun = (status: SlotRunStatus): SlotRun =>
  ({ id: 'run-1', slotId: 'slot-1', status }) as SlotRun;

describe('DashboardService', () => {
  describe('getStats', () => {
    it('ADMIN thấy số toàn hệ thống và cả số nhân sự đang hoạt động', async () => {
      const { repository, service } = setup();

      const stats = await service.getStats({}, ADMIN);

      expect(repository.countContentInventory).toHaveBeenCalledWith(null);
      expect(stats.scopedToOwnContent).toBe(false);
      expect(stats.live.activeUsers).toBe(4);
      expect(stats.inventory.pendingReview).toBe(5);
      expect(stats.production.successPosts).toBe(140);
    });

    it('EDITOR thấy số toàn hệ thống nhưng KHÔNG thấy số nhân sự', async () => {
      const { repository, service } = setup();

      const stats = await service.getStats({}, EDITOR);

      expect(repository.countContentInventory).toHaveBeenCalledWith(null);
      expect(repository.countActiveUsers).not.toHaveBeenCalled();
      expect(stats.live.activeUsers).toBeNull();
    });

    it('CONTENT chỉ được đếm trên bài của chính mình', async () => {
      const { repository, service } = setup();

      const stats = await service.getStats({}, CONTENT);

      expect(repository.countContentInventory).toHaveBeenCalledWith(CONTENT.id);
      expect(repository.countNewContent).toHaveBeenCalledWith(
        expect.anything(),
        CONTENT.id,
      );
      expect(repository.countAdsVideos).toHaveBeenCalledWith(
        expect.anything(),
        CONTENT.id,
      );
      expect(repository.countJobVolume).toHaveBeenCalledWith(
        expect.anything(),
        CONTENT.id,
      );
      expect(repository.countInFlightJobs).toHaveBeenCalledWith(CONTENT.id);
      expect(stats.scopedToOwnContent).toBe(true);
      expect(stats.live.activeUsers).toBeNull();
    });

    it('tính tỷ lệ thành công làm tròn 1 số lẻ', async () => {
      const { repository, service } = setup();
      repository.countJobVolume.mockResolvedValue({ success: 140, failed: 3 });

      const stats = await service.getStats({}, ADMIN);

      expect(stats.production.successRate).toBe(97.9);
    });

    it('chưa có job nào đóng sổ ⇒ successRate là null, không phải 0', async () => {
      const { repository, service } = setup();
      repository.countJobVolume.mockResolvedValue({ success: 0, failed: 0 });

      const stats = await service.getStats({}, ADMIN);

      expect(stats.production.successRate).toBeNull();
    });

    it('đăng hỏng sạch ⇒ successRate là 0 (khác hẳn null)', async () => {
      const { repository, service } = setup();
      repository.countJobVolume.mockResolvedValue({ success: 0, failed: 5 });

      const stats = await service.getStats({}, ADMIN);

      expect(stats.production.successRate).toBe(0);
    });

    it('bỏ trống from/to ⇒ trả về đúng kỳ 7 ngày đã dùng để đếm', async () => {
      const { service } = setup();

      const stats = await service.getStats({}, ADMIN);

      expect(stats.range).toEqual({ from: '2026-07-19', to: '2026-07-25' });
    });

    it('from > to ⇒ ném lỗi 400 trước khi chạm DB', async () => {
      const { repository, service } = setup();

      await expect(
        service.getStats({ from: '2026-07-25', to: '2026-07-01' }, ADMIN),
      ).rejects.toThrow('`from` phải nhỏ hơn hoặc bằng `to`');
      expect(repository.countJobVolume).not.toHaveBeenCalled();
    });
  });

  describe('getDailyChart', () => {
    it('điền đủ ngày trống trong kỳ để chart không nhảy cóc', async () => {
      const { repository, service } = setup();
      repository.dailyJobStats.mockResolvedValue([
        { date: '2026-07-21', success: 3, failed: 1 },
      ]);

      const chart = await service.getDailyChart(
        { from: '2026-07-20', to: '2026-07-22' },
        ADMIN,
      );

      expect(chart.items).toEqual([
        { date: '2026-07-20', success: 0, failed: 0 },
        { date: '2026-07-21', success: 3, failed: 1 },
        { date: '2026-07-22', success: 0, failed: 0 },
      ]);
    });

    it('CONTENT chỉ lấy chart của bài mình', async () => {
      const { repository, service } = setup();

      await service.getDailyChart({}, CONTENT);

      expect(repository.dailyJobStats).toHaveBeenCalledWith(
        expect.anything(),
        TZ,
        CONTENT.id,
      );
    });
  });

  describe('getPostsByPage', () => {
    it('mặc định không lọc loại media', async () => {
      const { repository, service } = setup();

      await service.getPostsByPage({}, ADMIN);

      expect(repository.postsByPage).toHaveBeenCalledWith(
        expect.anything(),
        DashboardMediaType.all,
        null,
      );
    });

    it('lọc video và scope theo CONTENT', async () => {
      const { repository, service } = setup();

      await service.getPostsByPage(
        { mediaType: DashboardMediaType.video },
        CONTENT,
      );

      expect(repository.postsByPage).toHaveBeenCalledWith(
        expect.anything(),
        DashboardMediaType.video,
        CONTENT.id,
      );
    });
  });

  describe('getHealth', () => {
    it('CONTENT bị chặn — cảnh báo vận hành không dành cho role này', async () => {
      const { service } = setup();

      await expect(service.getHealth(CONTENT)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('hệ thống sạch ⇒ không đẻ alert giả', async () => {
      const { repository, service } = setup();
      repository.countJobVolume.mockResolvedValue({ success: 10, failed: 0 });

      const health = await service.getHealth(ADMIN);

      expect(health.alerts).toEqual([]);
      expect(health.checkedAt).toEqual(NOW);
    });

    it('gom đủ 5 loại cảnh báo, mỗi cảnh báo có link sang màn xử lý', async () => {
      const { repository, monitor, autoPostConfigs, slotRuns, service } =
        setup();
      repository.countJobVolume.mockResolvedValue({ success: 1, failed: 3 });
      monitor.getQueueSummary.mockResolvedValue({
        stuck: [{ id: 'job-1' }],
        stuckThresholdMinutes: 15,
      });
      slotRuns.findByRunDate.mockResolvedValue([
        makeRun(SlotRunStatus.SKIPPED),
        makeRun(SlotRunStatus.ERROR),
        makeRun(SlotRunStatus.DONE),
      ]);
      autoPostConfigs.findAllConfigs.mockResolvedValue([makeConfig()]);
      repository.findPagesWithExpiringToken.mockResolvedValue([
        { id: 'page-1', pageName: 'Cửa hàng', tokenExpireAt: NOW },
      ]);

      const health = await service.getHealth(ADMIN);

      expect(health.alerts.map((alert) => alert.code)).toEqual([
        'FAILED_JOBS',
        'STUCK_JOBS',
        'MISSED_SLOTS',
        'EMPTY_POOL',
        'TOKEN_EXPIRING',
      ]);
      expect(health.alerts.find((a) => a.code === 'MISSED_SLOTS')?.count).toBe(
        2,
      );
      expect(health.alerts.every((alert) => alert.link !== '')).toBe(true);
    });

    it('không cảnh báo hết bài với page đang tắt auto hoặc đang tạm dừng', async () => {
      const { autoPostConfigs, service } = setup();
      autoPostConfigs.findAllConfigs.mockResolvedValue([
        makeConfig({ enabled: false }),
        makeConfig({ isActive: false }),
        makeConfig({ slots: [] }),
      ]);

      const health = await service.getHealth(ADMIN);

      expect(health.alerts.some((alert) => alert.code === 'EMPTY_POOL')).toBe(
        false,
      );
    });

    it('page còn ít nhất một mốc giờ có bài ⇒ không coi là hết bài', async () => {
      const { autoPostConfigs, service } = setup();
      autoPostConfigs.findAllConfigs.mockResolvedValue([
        makeConfig({
          slots: [
            { id: 's1', enabled: true, readyCount: 0 },
            { id: 's2', enabled: true, readyCount: 4 },
          ] as AutoPostConfigResponse['slots'],
        }),
      ]);

      const health = await service.getHealth(ADMIN);

      expect(health.alerts.some((alert) => alert.code === 'EMPTY_POOL')).toBe(
        false,
      );
    });

    it('EDITOR không được biết page nào sắp hết hạn token', async () => {
      const { repository, service } = setup();

      const health = await service.getHealth(EDITOR);

      expect(repository.findPagesWithExpiringToken).not.toHaveBeenCalled();
      expect(health.alerts.some((a) => a.code === 'TOKEN_EXPIRING')).toBe(
        false,
      );
    });
  });
});
