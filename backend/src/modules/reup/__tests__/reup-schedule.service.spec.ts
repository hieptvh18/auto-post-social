import { BadRequestException } from '@nestjs/common';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { SettingsService } from '../../settings/settings.service';
import type { ReupScheduleSettingsValue } from '../../settings/settings.types';
import type { ReupCleanupService } from '../reup-cleanup.service';
import type { ReupDiscoveryService } from '../reup-discovery.service';
import { ReupScheduleService } from '../reup-schedule.service';
import {
  REUP_CLEANUP_CRON_NAME,
  REUP_DISCOVERY_CRON_NAME,
} from '../reup.constants';

const DEFAULT_CONFIG: ReupScheduleSettingsValue = {
  discoveryEnabled: true,
  discoveryTime: '02:00',
  cleanupEnabled: true,
  cleanupTime: '03:00',
};

/**
 * Registry giả mô phỏng đúng hai hành vi thật khiến plan 32 phải viết test:
 * `deleteCronJob` NÉM khi job chưa tồn tại, và job bị xoá khỏi map vẫn là object
 * riêng nên nếu quên `stop()` thì không ai biết.
 */
function createRegistry() {
  const jobs = new Map<string, { stop: jest.Mock; nextDate: jest.Mock }>();
  return {
    jobs,
    doesExist: jest.fn((_type: string, name: string) => jobs.has(name)),
    getCronJob: jest.fn((name: string) => {
      const job = jobs.get(name);
      if (job === undefined) throw new Error(`No cron job ${name}`);
      return job;
    }),
    addCronJob: jest.fn((name: string, job: unknown) => {
      jobs.set(name, job as { stop: jest.Mock; nextDate: jest.Mock });
    }),
    deleteCronJob: jest.fn((name: string) => {
      if (!jobs.has(name)) {
        throw new Error(`No cron job ${name} — deleteCronJob ném lỗi thật`);
      }
      jobs.delete(name);
    }),
  };
}

describe('ReupScheduleService', () => {
  let registry: ReturnType<typeof createRegistry>;
  let settings: {
    getReupScheduleConfig: jest.Mock;
    getReupScheduleUpdatedAt: jest.Mock;
    updateReupScheduleSettings: jest.Mock;
  };
  let discovery: { discoverAll: jest.Mock };
  let cleanup: { run: jest.Mock };
  let service: ReupScheduleService;

  const build = () =>
    new ReupScheduleService(
      registry as unknown as SchedulerRegistry,
      settings as unknown as SettingsService,
      discovery as unknown as ReupDiscoveryService,
      cleanup as unknown as ReupCleanupService,
    );

  afterEach(async () => {
    // Job thật của thư viện `cron` giữ một timer sống cho tới khi stop() — dọn
    // sau mỗi test để Jest thoát được, không phải lỗi hành vi (đã assert riêng).
    for (const job of registry?.jobs.values() ?? []) {
      await job.stop();
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    registry = createRegistry();
    settings = {
      getReupScheduleConfig: jest.fn().mockResolvedValue(DEFAULT_CONFIG),
      getReupScheduleUpdatedAt: jest.fn().mockResolvedValue(null),
      updateReupScheduleSettings: jest
        .fn()
        .mockImplementation((input: ReupScheduleSettingsValue) =>
          Promise.resolve(input),
        ),
    };
    discovery = { discoverAll: jest.fn().mockResolvedValue([]) };
    cleanup = {
      run: jest
        .fn()
        .mockResolvedValue({ deletedCount: 0, freedBytes: 0, failedCount: 0 }),
    };
    service = build();
  });

  describe('onModuleInit', () => {
    it('lần boot đầu (registry rỗng) KHÔNG ném lỗi dù deleteCronJob ném khi job chưa tồn tại', async () => {
      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(registry.deleteCronJob).not.toHaveBeenCalled();
      expect(registry.addCronJob).toHaveBeenCalledTimes(2);
    });

    it('đăng ký đúng 2 job với tên cố định', async () => {
      await service.onModuleInit();

      expect(registry.jobs.has(REUP_DISCOVERY_CRON_NAME)).toBe(true);
      expect(registry.jobs.has(REUP_CLEANUP_CRON_NAME)).toBe(true);
    });

    it('settings trong DB hỏng ⇒ SettingsService trả mặc định 02:00 ⇒ app vẫn boot', async () => {
      // `getReupScheduleConfig` tự nuốt lỗi và trả mặc định (R3) — ở đây khẳng
      // định service dựng job bình thường từ giá trị mặc định đó.
      settings.getReupScheduleConfig.mockResolvedValue(DEFAULT_CONFIG);

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      const job = registry.addCronJob.mock.calls[0][1] as { cronTime: unknown };
      expect(String(job.cronTime)).toContain('0 2');
    });
  });

  describe('rescheduleAll', () => {
    it('đổi giờ ⇒ job cũ được stop() VÀ xoá khỏi registry — không còn 2 job cùng chạy', async () => {
      await service.rescheduleAll();
      const oldJob = registry.jobs.get(REUP_DISCOVERY_CRON_NAME);
      const stopSpy = jest.spyOn(
        oldJob as unknown as { stop: () => Promise<void> },
        'stop',
      );

      settings.getReupScheduleConfig.mockResolvedValue({
        ...DEFAULT_CONFIG,
        discoveryTime: '05:30',
      });
      await service.rescheduleAll();

      expect(stopSpy).toHaveBeenCalled();
      expect(registry.deleteCronJob).toHaveBeenCalledWith(
        REUP_DISCOVERY_CRON_NAME,
      );
      // Vẫn đúng 1 job discovery trong registry, không tích luỹ.
      expect(registry.jobs.get(REUP_DISCOVERY_CRON_NAME)).not.toBe(oldJob);
      expect(
        registry.addCronJob.mock.calls.filter(
          (call) => call[0] === REUP_DISCOVERY_CRON_NAME,
        ),
      ).toHaveLength(2);
    });

    it('đổi giờ 3 lần liên tiếp ⇒ vẫn đúng 1 job mỗi loại', async () => {
      for (const time of ['04:00', '05:00', '06:00']) {
        settings.getReupScheduleConfig.mockResolvedValue({
          ...DEFAULT_CONFIG,
          discoveryTime: time,
        });
        await service.rescheduleAll();
      }

      expect(registry.jobs.size).toBe(2);
    });

    it('discoveryEnabled = false ⇒ KHÔNG đăng ký job quét', async () => {
      settings.getReupScheduleConfig.mockResolvedValue({
        ...DEFAULT_CONFIG,
        discoveryEnabled: false,
      });

      await service.rescheduleAll();

      expect(registry.jobs.has(REUP_DISCOVERY_CRON_NAME)).toBe(false);
      expect(registry.jobs.has(REUP_CLEANUP_CRON_NAME)).toBe(true);
    });

    it('tắt cả hai ⇒ không đăng ký job nào', async () => {
      settings.getReupScheduleConfig.mockResolvedValue({
        discoveryEnabled: false,
        discoveryTime: '02:00',
        cleanupEnabled: false,
        cleanupTime: '03:00',
      });

      await service.rescheduleAll();

      expect(registry.addCronJob).not.toHaveBeenCalled();
    });

    it('đang bật rồi tắt ⇒ job cũ bị stop() và gỡ khỏi registry', async () => {
      await service.rescheduleAll();
      const oldJob = registry.jobs.get(REUP_DISCOVERY_CRON_NAME);
      const stopSpy = jest.spyOn(
        oldJob as unknown as { stop: () => Promise<void> },
        'stop',
      );

      settings.getReupScheduleConfig.mockResolvedValue({
        ...DEFAULT_CONFIG,
        discoveryEnabled: false,
      });
      await service.rescheduleAll();

      expect(stopSpy).toHaveBeenCalled();
      expect(registry.jobs.has(REUP_DISCOVERY_CRON_NAME)).toBe(false);
    });

    it('dựng cron expression đúng từ HH:mm (bỏ số 0 đứng đầu)', async () => {
      settings.getReupScheduleConfig.mockResolvedValue({
        ...DEFAULT_CONFIG,
        discoveryTime: '07:05',
        cleanupEnabled: false,
      });

      await service.rescheduleAll();

      const job = registry.addCronJob.mock.calls[0][1] as { cronTime: unknown };
      expect(String(job.cronTime)).toContain('5 7');
    });
  });

  describe('getSettings', () => {
    it('trả nextRunAt của mỗi cron đang chạy', async () => {
      await service.rescheduleAll();

      const result = await service.getSettings();

      expect(result.discoveryNextRunAt).toBeInstanceOf(Date);
      expect(result.cleanupNextRunAt).toBeInstanceOf(Date);
    });

    it('cron tắt ⇒ nextRunAt = null (không bịa giờ chạy cho job không tồn tại)', async () => {
      settings.getReupScheduleConfig.mockResolvedValue({
        ...DEFAULT_CONFIG,
        discoveryEnabled: false,
      });
      await service.rescheduleAll();

      const result = await service.getSettings();

      expect(result.discoveryNextRunAt).toBeNull();
      expect(result.cleanupNextRunAt).toBeInstanceOf(Date);
    });
  });

  describe('updateSettings', () => {
    it('lưu xong đăng ký lại NGAY ⇒ nextRunAt phản ánh giờ mới, không cần restart', async () => {
      await service.rescheduleAll();
      const input: ReupScheduleSettingsValue = {
        ...DEFAULT_CONFIG,
        discoveryTime: '09:15',
      };
      settings.updateReupScheduleSettings.mockResolvedValue(input);
      settings.getReupScheduleConfig.mockResolvedValue(input);

      const result = await service.updateSettings(input, 'user-1');

      expect(settings.updateReupScheduleSettings).toHaveBeenCalledWith(
        input,
        'user-1',
      );
      expect(result.discoveryTime).toBe('09:15');
      const nextRun = result.discoveryNextRunAt;
      expect(nextRun).not.toBeNull();
      expect((nextRun as Date).getMinutes()).toBe(15);
    });

    it('settings ném 400 (giờ trùng nhau) ⇒ KHÔNG đụng tới cron đang chạy', async () => {
      await service.rescheduleAll();
      registry.addCronJob.mockClear();
      registry.deleteCronJob.mockClear();
      settings.updateReupScheduleSettings.mockRejectedValue(
        new BadRequestException('trùng giờ'),
      );

      await expect(
        service.updateSettings(
          { ...DEFAULT_CONFIG, cleanupTime: '02:00' },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(registry.deleteCronJob).not.toHaveBeenCalled();
      expect(registry.addCronJob).not.toHaveBeenCalled();
    });
  });

  describe('onTick', () => {
    it('lỗi của discovery KHÔNG được ném ra ngoài (không kéo sập process)', async () => {
      discovery.discoverAll.mockRejectedValue(new Error('DB down'));
      await service.rescheduleAll();
      const job = registry.addCronJob.mock.calls.find(
        (call) => call[0] === REUP_DISCOVERY_CRON_NAME,
      )?.[1] as { fireOnTick: () => Promise<void> };

      await expect(job.fireOnTick()).resolves.toBeUndefined();
      expect(discovery.discoverAll).toHaveBeenCalledWith(null);
    });

    it('lỗi của cleanup KHÔNG được ném ra ngoài', async () => {
      cleanup.run.mockRejectedValue(new Error('Drive down'));
      await service.rescheduleAll();
      const job = registry.addCronJob.mock.calls.find(
        (call) => call[0] === REUP_CLEANUP_CRON_NAME,
      )?.[1] as { fireOnTick: () => Promise<void> };

      await expect(job.fireOnTick()).resolves.toBeUndefined();
      expect(cleanup.run).toHaveBeenCalledWith(null);
    });
  });
});
