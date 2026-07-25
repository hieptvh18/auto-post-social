import type { Queue } from 'bullmq';
import {
  MediaType,
  PublishStatus,
  type ContentAsset,
  type FacebookPage,
} from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import type { ClockService } from '../../../infra/clock/clock.service';
import type {
  JobWithContext,
  PublishJobsRepository,
  StatusCounts,
} from '../../publish-jobs/publish-jobs.repository';
import type { PublishFacebookJobData } from '../../publish-jobs/publish-queue.constants';
import { MonitorService } from '../monitor.service';

const NOW = new Date('2026-07-25T10:00:00Z');

const emptyCounts = (): StatusCounts => ({
  [PublishStatus.SCHEDULED]: 0,
  [PublishStatus.QUEUED]: 0,
  [PublishStatus.PUBLISHING]: 0,
  [PublishStatus.SUCCESS]: 0,
  [PublishStatus.FAILED]: 0,
  [PublishStatus.CANCELLED]: 0,
});

const makeJob = (overrides: Partial<JobWithContext> = {}): JobWithContext =>
  ({
    id: 'job-1',
    contentAssetId: 'content-1',
    facebookPageId: 'page-1',
    status: PublishStatus.PUBLISHING,
    updatedAt: new Date('2026-07-25T09:13:00Z'),
    contentAsset: {
      id: 'content-1',
      title: 'Ảnh khai trương',
      mediaType: MediaType.image,
    } as ContentAsset,
    facebookPage: {
      id: 'page-1',
      pageName: 'Cửa hàng cây cảnh',
    } as FacebookPage,
    ...overrides,
  }) as JobWithContext;

interface Mocks {
  repository: jest.Mocked<
    Pick<
      PublishJobsRepository,
      'countByStatus' | 'findStuckPublishing' | 'findActive'
    >
  >;
  queue: { getJobCounts: jest.Mock };
  service: MonitorService;
}

function setup(stuckMinutes = 15): Mocks {
  const repository = {
    countByStatus: jest.fn().mockResolvedValue(emptyCounts()),
    findStuckPublishing: jest.fn().mockResolvedValue([]),
    findActive: jest.fn().mockResolvedValue([]),
  };
  const queue = {
    getJobCounts: jest.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      delayed: 0,
      failed: 0,
      completed: 0,
    }),
  };
  const clock: Pick<ClockService, 'now'> = { now: () => NOW };
  const config = { monitor: { stuckMinutes } } as AppConfigService;

  const service = new MonitorService(
    repository as unknown as PublishJobsRepository,
    clock,
    config,
    queue as unknown as Queue<PublishFacebookJobData>,
  );

  return { repository, queue, service };
}

describe('MonitorService', () => {
  describe('getQueueSummary', () => {
    it('trả số liệu BullMQ khi Redis khoẻ', async () => {
      const { queue, service } = setup();
      queue.getJobCounts.mockResolvedValue({
        waiting: 3,
        active: 1,
        delayed: 2,
        failed: 5,
        completed: 120,
      });

      const summary = await service.getQueueSummary();

      expect(summary.queueHealthy).toBe(true);
      expect(summary.queue).toEqual({
        waiting: 3,
        active: 1,
        delayed: 2,
        failed: 5,
        completed: 120,
      });
      expect(summary.queueError).toBeNull();
      expect(summary.checkedAt).toEqual(NOW);
    });

    it('Redis lỗi ⇒ queueHealthy=false, queue=null, không ném lỗi', async () => {
      const { queue, service } = setup();
      queue.getJobCounts.mockRejectedValue(new Error('ECONNREFUSED'));

      const summary = await service.getQueueSummary();

      expect(summary.queueHealthy).toBe(false);
      expect(summary.queue).toBeNull();
      expect(summary.queueError).toBe('ECONNREFUSED');
    });

    it('Redis lỗi vẫn trả đủ số liệu DB — màn giám sát không được chết theo', async () => {
      const { repository, queue, service } = setup();
      queue.getJobCounts.mockRejectedValue(new Error('ECONNREFUSED'));
      repository.countByStatus.mockResolvedValue({
        ...emptyCounts(),
        [PublishStatus.QUEUED]: 3,
        [PublishStatus.SUCCESS]: 120,
      });

      const summary = await service.getQueueSummary();

      expect(summary.db[PublishStatus.QUEUED]).toBe(3);
      expect(summary.db[PublishStatus.SUCCESS]).toBe(120);
    });

    it('DB và Redis lệch nhau vẫn báo cáo cả hai (dấu hiệu Redis bị flush)', async () => {
      const { repository, queue, service } = setup();
      queue.getJobCounts.mockResolvedValue({
        waiting: 0,
        active: 0,
        delayed: 0,
        failed: 0,
        completed: 0,
      });
      repository.countByStatus.mockResolvedValue({
        ...emptyCounts(),
        [PublishStatus.QUEUED]: 7,
      });

      const summary = await service.getQueueSummary();

      expect(summary.queue?.waiting).toBe(0);
      expect(summary.db[PublishStatus.QUEUED]).toBe(7);
    });
  });

  describe('job kẹt', () => {
    it('tính số phút kẹt theo clock đã inject, không theo giờ chạy test', async () => {
      const { repository, service } = setup();
      repository.findStuckPublishing.mockResolvedValue([
        makeJob({ updatedAt: new Date('2026-07-25T09:13:00Z') }),
      ]);

      const summary = await service.getQueueSummary();

      expect(summary.stuck).toHaveLength(1);
      expect(summary.stuck[0]).toMatchObject({
        id: 'job-1',
        contentTitle: 'Ảnh khai trương',
        pageName: 'Cửa hàng cây cảnh',
        status: PublishStatus.PUBLISHING,
        stuckMinutes: 47,
      });
    });

    it('lấy ngưỡng kẹt từ env: hỏi DB job PUBLISHING cũ hơn now - MONITOR_STUCK_MINUTES', async () => {
      const { repository, service } = setup(30);

      const summary = await service.getQueueSummary();

      expect(repository.findStuckPublishing).toHaveBeenCalledWith(
        new Date('2026-07-25T09:30:00Z'),
      );
      expect(summary.stuckThresholdMinutes).toBe(30);
    });

    it('không có job kẹt ⇒ mảng rỗng', async () => {
      const { service } = setup();

      const summary = await service.getQueueSummary();

      expect(summary.stuck).toEqual([]);
    });
  });
});
