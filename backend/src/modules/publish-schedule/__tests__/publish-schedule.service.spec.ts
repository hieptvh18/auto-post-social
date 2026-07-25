import {
  MediaType,
  PublishStatus,
  SlotMediaType,
  type AutoPostSlot,
  type FacebookPage,
} from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import type { ClockService } from '../../../infra/clock/clock.service';
import type { SlotRunService } from '../../auto-post/slot-run.service';
import type {
  AutoPostConfigsRepository,
  PageWithSlots,
} from '../../auto-post-configs/auto-post-configs.repository';
import type {
  PublishScheduleRepository,
  ScheduleJobRow,
} from '../publish-schedule.repository';
import { PublishScheduleService } from '../publish-schedule.service';

const TIMEZONE = 'Asia/Ho_Chi_Minh';
const PAGE_ID = '11111111-1111-1111-1111-111111111111';
const SLOT_ID = '22222222-2222-2222-2222-222222222222';

function makePage(overrides: Partial<PageWithSlots> = {}): PageWithSlots {
  const page: FacebookPage = {
    id: PAGE_ID,
    pageName: 'Cây cảnh mini',
    pageId: '111367907895365',
    accessTokenEnc: 'enc',
    tokenExpireAt: null,
    isActive: true,
    autopostEnabled: true,
    deletedAt: null,
    createdById: '33333333-3333-3333-3333-333333333333',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
  };

  return { ...page, autoPostSlots: [makeSlot()], ...overrides };
}

function makeSlot(overrides: Partial<AutoPostSlot> = {}): AutoPostSlot {
  return {
    id: SLOT_ID,
    facebookPageId: PAGE_ID,
    time: '08:00',
    categories: ['Review'],
    mediaType: SlotMediaType.all,
    postCount: 2,
    enabled: true,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

function makeJob(overrides: Partial<ScheduleJobRow> = {}): ScheduleJobRow {
  return {
    id: '44444444-4444-4444-4444-444444444444',
    contentAssetId: '55555555-5555-5555-5555-555555555555',
    facebookPageId: PAGE_ID,
    caption: 'Caption',
    hashtags: '#cay',
    // 01:00 UTC = 08:00 giờ VN — cố ý lệch để bắt lỗi quy đổi timezone.
    scheduleTime: new Date('2026-07-25T01:00:00Z'),
    status: PublishStatus.SUCCESS,
    publishedAt: new Date('2026-07-25T01:00:10Z'),
    facebookPostId: '111_222',
    errorMessage: null,
    attemptCount: 1,
    bullJobId: null,
    createdBy: 'Bot',
    createdAt: new Date('2026-07-25T01:00:00Z'),
    updatedAt: new Date('2026-07-25T01:00:10Z'),
    contentAsset: {
      id: '55555555-5555-5555-5555-555555555555',
      title: 'Bài review chậu sứ',
      category: 'Review',
      mediaType: MediaType.image,
      driveUrl: 'https://drive.google.com/file/d/abc',
      thumbnailUrl: null,
    },
    facebookPage: {
      id: PAGE_ID,
      pageName: 'Cây cảnh mini',
      pageId: '111367907895365',
    },
    ...overrides,
  };
}

describe('PublishScheduleService', () => {
  let repository: jest.Mocked<
    Pick<PublishScheduleRepository, 'findJobsInRange' | 'countReadyForSlot'>
  >;
  let configsRepository: jest.Mocked<
    Pick<AutoPostConfigsRepository, 'findPagesWithSlots'>
  >;
  let slotRuns: jest.Mocked<Pick<SlotRunService, 'findByRunDate'>>;
  let service: PublishScheduleService;

  const clock: ClockService = {
    // 2026-07-25 17:00 giờ VN
    now: () => new Date('2026-07-25T10:00:00Z'),
  };

  beforeEach(() => {
    repository = {
      findJobsInRange: jest.fn().mockResolvedValue([]),
      countReadyForSlot: jest.fn().mockResolvedValue(5),
    };
    configsRepository = {
      findPagesWithSlots: jest.fn().mockResolvedValue([makePage()]),
    };
    slotRuns = { findByRunDate: jest.fn().mockResolvedValue([]) };

    service = new PublishScheduleService(
      repository as unknown as PublishScheduleRepository,
      configsRepository as unknown as AutoPostConfigsRepository,
      slotRuns as unknown as SlotRunService,
      clock,
      { timezone: TIMEZONE } as AppConfigService,
    );
  });

  describe('getSchedule', () => {
    it('mặc định lấy ngày hôm nay theo giờ VN và truy vấn đúng khoảng UTC của ngày đó', async () => {
      const result = await service.getSchedule({});

      expect(result.date).toBe('2026-07-25');
      expect(result.timezone).toBe(TIMEZONE);
      // 00:00 giờ VN 25/07 = 17:00 UTC 24/07.
      expect(repository.findJobsInRange).toHaveBeenCalledWith(
        new Date('2026-07-24T17:00:00Z'),
        new Date('2026-07-25T17:00:00Z'),
        undefined,
      );
    });

    it('mỗi mốc giờ của mỗi page là một dòng lịch, kể cả khi chưa có job nào', async () => {
      const result = await service.getSchedule({ date: '2026-07-26' });

      expect(result.items).toHaveLength(1);
      const [item] = result.items;
      expect(item.kind).toBe('slot');
      expect(item.slotId).toBe(SLOT_ID);
      expect(item.time).toBe('08:00');
      expect(item.pageName).toBe('Cây cảnh mini');
      expect(item.plannedCount).toBe(2);
      expect(item.readyCount).toBe(5);
      expect(item.jobs).toHaveLength(0);
      // 26/07 là ngày mai so với clock ⇒ vẫn đang chờ tới giờ.
      expect(item.progress).toBe('PENDING');
      expect(result.summary.plannedPosts).toBe(2);
    });

    it('ghép job của Bot vào slot theo giờ VN (job lưu UTC lệch ngày)', async () => {
      repository.findJobsInRange.mockResolvedValue([makeJob()]);

      const result = await service.getSchedule({ date: '2026-07-25' });

      expect(result.items).toHaveLength(1);
      const [item] = result.items;
      expect(item.slotId).toBe(SLOT_ID);
      expect(item.jobs).toHaveLength(1);
      expect(item.jobs[0].contentTitle).toBe('Bài review chậu sứ');
      expect(item.successCount).toBe(1);
      // Kế hoạch 2 bài, mới xong 1 và không còn job đang chạy.
      expect(item.progress).toBe('PARTIAL');
    });

    it('bài đăng tay thành dòng riêng, người đăng là USER chứ không phải Bot', async () => {
      repository.findJobsInRange.mockResolvedValue([
        makeJob({
          id: '66666666-6666-6666-6666-666666666666',
          createdBy: 'Trần Hiệp',
          scheduleTime: new Date('2026-07-25T07:30:00Z'), // 14:30 giờ VN
        }),
      ]);

      const result = await service.getSchedule({ date: '2026-07-25' });

      const manual = result.items.find((item) => item.kind === 'manual');
      expect(manual).toBeDefined();
      expect(manual?.time).toBe('14:30');
      expect(manual?.slotId).toBeNull();
      expect(manual?.publishers).toEqual(['Trần Hiệp']);
      expect(manual?.jobs[0].publishedBy).toBe('Trần Hiệp');
      expect(manual?.jobs[0].isManual).toBe(true);
      expect(result.summary.manualPosts).toBe(1);
      // Không được đếm lẫn vào slot 08:00.
      const slotItem = result.items.find((item) => item.kind === 'slot');
      expect(slotItem?.jobs).toHaveLength(0);
    });

    it('job Bot không khớp mốc giờ nào (slot đã đổi giờ/bị xoá) vẫn hiện, gom theo giờ', async () => {
      repository.findJobsInRange.mockResolvedValue([
        makeJob({ scheduleTime: new Date('2026-07-25T02:00:00Z') }), // 09:00 VN
      ]);

      const result = await service.getSchedule({ date: '2026-07-25' });

      const loose = result.items.find((item) => item.time === '09:00');
      expect(loose).toBeDefined();
      expect(loose?.kind).toBe('slot');
      expect(loose?.slotId).toBeNull();
      expect(loose?.publishers).toEqual(['Bot']);
    });

    it('slot tắt hoặc page tắt auto hoặc page tạm dừng ⇒ PAUSED', async () => {
      const cases: PageWithSlots[] = [
        makePage({ autoPostSlots: [makeSlot({ enabled: false })] }),
        makePage({ autopostEnabled: false }),
        makePage({ isActive: false }),
      ];

      for (const page of cases) {
        configsRepository.findPagesWithSlots.mockResolvedValue([page]);
        const result = await service.getSchedule({ date: '2026-07-26' });
        expect(result.items[0].progress).toBe('PAUSED');
      }
    });

    it('mốc giờ đã qua trong hôm nay mà không có job ⇒ MISSED', async () => {
      const result = await service.getSchedule({ date: '2026-07-25' });

      // Clock = 17:00 VN, slot 08:00 đã qua.
      expect(result.items[0].progress).toBe('MISSED');
    });

    it('kho hết bài hợp lệ cho slot ⇒ NO_CONTENT', async () => {
      repository.countReadyForSlot.mockResolvedValue(0);

      const result = await service.getSchedule({ date: '2026-07-26' });

      expect(result.items[0].progress).toBe('NO_CONTENT');
    });

    it('filter pageId chỉ giữ page đó và truyền xuống repository', async () => {
      const otherPage = makePage({
        id: '77777777-7777-7777-7777-777777777777',
        pageName: 'Page khác',
        autoPostSlots: [
          makeSlot({
            id: '88888888-8888-8888-8888-888888888888',
            facebookPageId: '77777777-7777-7777-7777-777777777777',
          }),
        ],
      });
      configsRepository.findPagesWithSlots.mockResolvedValue([
        makePage(),
        otherPage,
      ]);

      const result = await service.getSchedule({
        date: '2026-07-25',
        pageId: PAGE_ID,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].pageId).toBe(PAGE_ID);
      expect(repository.findJobsInRange).toHaveBeenCalledWith(
        expect.any(Date),
        expect.any(Date),
        PAGE_ID,
      );
    });

    it('filter status ẩn mốc giờ không có job nào khớp', async () => {
      repository.findJobsInRange.mockResolvedValue([makeJob()]);

      const failed = await service.getSchedule({
        date: '2026-07-25',
        status: PublishStatus.FAILED,
      });
      expect(failed.items).toHaveLength(0);

      const success = await service.getSchedule({
        date: '2026-07-25',
        status: PublishStatus.SUCCESS,
      });
      expect(success.items).toHaveLength(1);
      expect(success.items[0].jobs).toHaveLength(1);
    });

    it('summary tổng hợp kế hoạch, kết quả và số page đang bật auto', async () => {
      repository.findJobsInRange.mockResolvedValue([
        makeJob(),
        makeJob({
          id: '99999999-9999-9999-9999-999999999999',
          status: PublishStatus.FAILED,
          publishedAt: null,
          facebookPostId: null,
          errorMessage: 'Graph API lỗi',
        }),
        makeJob({
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          status: PublishStatus.QUEUED,
          publishedAt: null,
          facebookPostId: null,
        }),
      ]);

      const result = await service.getSchedule({ date: '2026-07-25' });

      expect(result.summary.plannedPosts).toBe(2);
      expect(result.summary.activeSlots).toBe(1);
      expect(result.summary.pagesAutoOn).toBe(1);
      expect(result.summary.successPosts).toBe(1);
      expect(result.summary.failedPosts).toBe(1);
      expect(result.summary.runningPosts).toBe(1);
      expect(result.summary.manualPosts).toBe(0);
      expect(result.items[0].progress).toBe('RUNNING');
    });

    it('sắp xếp theo giờ tăng dần, cùng giờ thì theo tên page', async () => {
      configsRepository.findPagesWithSlots.mockResolvedValue([
        makePage({
          id: '77777777-7777-7777-7777-777777777777',
          pageName: 'Zalo shop',
          autoPostSlots: [
            makeSlot({
              id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
              time: '20:00',
            }),
            makeSlot({
              id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
              time: '08:00',
            }),
          ],
        }),
        makePage(),
      ]);

      const result = await service.getSchedule({ date: '2026-07-26' });

      expect(result.items.map((item) => [item.time, item.pageName])).toEqual([
        ['08:00', 'Cây cảnh mini'],
        ['08:00', 'Zalo shop'],
        ['20:00', 'Zalo shop'],
      ]);
    });
  });
});
