import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  SlotMediaType,
  SlotRunStatus,
  type AutoPostSlot,
  type FacebookPage,
  type PublishJob,
  type SlotRun,
} from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import type { ClockService } from '../../../infra/clock/clock.service';
import type {
  AutoPostConfigsRepository,
  SlotWithPage,
} from '../../auto-post-configs/auto-post-configs.repository';
import type { PublishJobsService } from '../../publish-jobs/publish-jobs.service';
import { AutoPostSchedulerService } from '../auto-post-scheduler.service';
import type {
  ContentPickerRepository,
  PickedContent,
} from '../content-picker.repository';
import { SkipReason, type SlotRunService } from '../slot-run.service';

const TIMEZONE = 'Asia/Ho_Chi_Minh';
// 2026-07-25 14:30 giờ VN.
const NOW = new Date('2026-07-25T07:30:00Z');

const makePage = (overrides: Partial<FacebookPage> = {}): FacebookPage => ({
  id: 'page-1',
  pageName: 'Cửa hàng cây cảnh',
  pageId: '111367907895365',
  accessTokenEnc: 'enc',
  tokenExpireAt: null,
  isActive: true,
  autopostEnabled: true,
  deletedAt: null,
  createdById: 'admin-1',
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const makeSlot = (overrides: Partial<AutoPostSlot> = {}): SlotWithPage => ({
  id: 'slot-1',
  facebookPageId: 'page-1',
  time: '14:30',
  categories: ['Review'],
  mediaType: SlotMediaType.all,
  postCount: 2,
  enabled: true,
  createdAt: NOW,
  updatedAt: NOW,
  facebookPage: makePage(),
  ...overrides,
});

const makeContent = (id: string): PickedContent => ({
  id,
  title: `Bài ${id}`,
  caption: 'Caption',
  hashtags: '#tag',
  mediaType: 'image',
  driveFileId: `drive-${id}`,
  mimeType: 'image/png',
  updatedAt: NOW,
});

const makeSlotRun = (): SlotRun => ({
  id: 'run-1',
  slotId: 'slot-1',
  runDate: '2026-07-25',
  runTime: '14:30',
  status: SlotRunStatus.CLAIMED,
  pickedCount: 0,
  jobCreatedCount: 0,
  skipReason: null,
  startedAt: NOW,
  finishedAt: null,
  errorMessage: null,
  createdAt: NOW,
});

describe('AutoPostSchedulerService', () => {
  let configsRepository: jest.Mocked<
    Pick<AutoPostConfigsRepository, 'findDueSlots' | 'findSlotWithPage'>
  >;
  let picker: jest.Mocked<Pick<ContentPickerRepository, 'pickForSlot'>>;
  let slotRuns: jest.Mocked<
    Pick<
      SlotRunService,
      'claim' | 'finishDone' | 'finishSkipped' | 'finishError'
    >
  >;
  let publishJobs: jest.Mocked<Pick<PublishJobsService, 'createQueuedJob'>>;
  let service: AutoPostSchedulerService;

  const clock: ClockService = { now: () => NOW };
  const config = {
    timezone: TIMEZONE,
    autoPost: { enabled: true, maxPostPerSlot: 20 },
  } as AppConfigService;

  beforeEach(() => {
    configsRepository = {
      findDueSlots: jest.fn().mockResolvedValue([]),
      findSlotWithPage: jest.fn().mockResolvedValue(makeSlot()),
    };
    picker = { pickForSlot: jest.fn().mockResolvedValue([]) };
    slotRuns = {
      claim: jest.fn().mockResolvedValue(makeSlotRun()),
      finishDone: jest.fn().mockResolvedValue(makeSlotRun()),
      finishSkipped: jest.fn().mockResolvedValue(makeSlotRun()),
      finishError: jest.fn().mockResolvedValue(makeSlotRun()),
    };
    publishJobs = {
      createQueuedJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    service = new AutoPostSchedulerService(
      configsRepository as unknown as AutoPostConfigsRepository,
      picker as unknown as ContentPickerRepository,
      slotRuns as unknown as SlotRunService,
      publishJobs as unknown as PublishJobsService,
      clock,
      config,
    );
  });

  describe('tick', () => {
    it('hỏi slot đến giờ bằng HH:mm theo giờ VN, không phải giờ UTC', async () => {
      await service.tick(NOW);

      expect(configsRepository.findDueSlots).toHaveBeenCalledWith('14:30');
    });

    it('claim slot-run theo đúng ngày VN và mốc giờ của slot', async () => {
      configsRepository.findDueSlots.mockResolvedValue([makeSlot()]);

      await service.tick(NOW);

      expect(slotRuns.claim).toHaveBeenCalledWith(
        'slot-1',
        '2026-07-25',
        '14:30',
      );
    });

    it('tạo đúng một job cho mỗi bài picker chọn, caption/hashtag lấy từ bài', async () => {
      configsRepository.findDueSlots.mockResolvedValue([makeSlot()]);
      picker.pickForSlot.mockResolvedValue([
        makeContent('c1'),
        makeContent('c2'),
      ]);

      const result = await service.tick(NOW);

      expect(publishJobs.createQueuedJob).toHaveBeenCalledTimes(2);
      const first = publishJobs.createQueuedJob.mock.calls[0][0];
      expect(first.contentAssetId).toBe('c1');
      expect(first.facebookPageId).toBe('page-1');
      expect(first.caption).toBe('Caption');
      expect(first.hashtags).toBe('#tag');
      expect(result.results[0].jobCreatedCount).toBe(2);
    });

    it('truyền postCount làm limit và categories/mediaType của slot xuống picker', async () => {
      configsRepository.findDueSlots.mockResolvedValue([
        makeSlot({ postCount: 3, mediaType: SlotMediaType.video }),
      ]);

      await service.tick(NOW);

      expect(picker.pickForSlot).toHaveBeenCalledWith({
        facebookPageId: 'page-1',
        categories: ['Review'],
        mediaType: 'video',
        limit: 3,
      });
    });

    it('mediaType "all" của slot ⇒ picker không lọc theo loại media', async () => {
      configsRepository.findDueSlots.mockResolvedValue([makeSlot()]);

      await service.tick(NOW);

      expect(picker.pickForSlot.mock.calls[0][0].mediaType).toBe('all');
    });

    it('CHỐNG DOUBLE-FIRE: chạy 2 lần cùng slot/phút chỉ tạo job một lần', async () => {
      configsRepository.findDueSlots.mockResolvedValue([makeSlot()]);
      picker.pickForSlot.mockResolvedValue([makeContent('c1')]);
      // Lần claim thứ hai đụng UNIQUE(slot, ngày, giờ) ⇒ repository trả null.
      slotRuns.claim
        .mockResolvedValueOnce(makeSlotRun())
        .mockResolvedValueOnce(null);

      await service.tick(NOW);
      const second = await service.tick(NOW);

      expect(publishJobs.createQueuedJob).toHaveBeenCalledTimes(1);
      expect(second.results[0].claimed).toBe(false);
      expect(picker.pickForSlot).toHaveBeenCalledTimes(1);
    });

    it('hết bài phù hợp ⇒ slot_run SKIPPED/NO_CONTENT và không tạo job', async () => {
      configsRepository.findDueSlots.mockResolvedValue([makeSlot()]);
      picker.pickForSlot.mockResolvedValue([]);

      const result = await service.tick(NOW);

      expect(slotRuns.finishSkipped).toHaveBeenCalledWith(
        'run-1',
        SkipReason.NO_CONTENT,
      );
      expect(publishJobs.createQueuedJob).not.toHaveBeenCalled();
      expect(result.results[0].skipReason).toBe(SkipReason.NO_CONTENT);
    });

    it('đóng sổ DONE kèm số bài chọn được và số job tạo được', async () => {
      configsRepository.findDueSlots.mockResolvedValue([makeSlot()]);
      picker.pickForSlot.mockResolvedValue([
        makeContent('c1'),
        makeContent('c2'),
      ]);

      await service.tick(NOW);

      expect(slotRuns.finishDone).toHaveBeenCalledWith('run-1', 2, 2);
    });

    it('một bài lỗi khi tạo job vẫn xếp hàng các bài còn lại, đếm đúng job thật sự tạo', async () => {
      configsRepository.findDueSlots.mockResolvedValue([makeSlot()]);
      picker.pickForSlot.mockResolvedValue([
        makeContent('c1'),
        makeContent('c2'),
      ]);
      publishJobs.createQueuedJob
        .mockRejectedValueOnce(new Error('Redis chết'))
        .mockResolvedValueOnce({ id: 'job-2' } as PublishJob);

      await service.tick(NOW);

      expect(publishJobs.createQueuedJob).toHaveBeenCalledTimes(2);
      expect(slotRuns.finishDone).toHaveBeenCalledWith('run-1', 2, 1);
    });

    it('picker ném lỗi ⇒ slot_run ERROR kèm message, không làm hỏng slot còn lại', async () => {
      configsRepository.findDueSlots.mockResolvedValue([
        makeSlot(),
        makeSlot({ id: 'slot-2', facebookPageId: 'page-2' }),
      ]);
      picker.pickForSlot
        .mockRejectedValueOnce(new Error('DB timeout'))
        .mockResolvedValueOnce([makeContent('c1')]);

      const result = await service.tick(NOW);

      expect(slotRuns.finishError).toHaveBeenCalledWith('run-1', 'DB timeout');
      expect(result.results).toHaveLength(2);
      expect(result.results[1].jobCreatedCount).toBe(1);
    });

    it('không có slot nào tới giờ ⇒ không claim, không tạo job', async () => {
      const result = await service.tick(NOW);

      expect(slotRuns.claim).not.toHaveBeenCalled();
      expect(publishJobs.createQueuedJob).not.toHaveBeenCalled();
      expect(result.dueSlotCount).toBe(0);
    });
  });

  describe('handleCron', () => {
    it('AUTOPOST_ENABLED=false ⇒ không làm gì cả', async () => {
      const disabled = new AutoPostSchedulerService(
        configsRepository as unknown as AutoPostConfigsRepository,
        picker as unknown as ContentPickerRepository,
        slotRuns as unknown as SlotRunService,
        publishJobs as unknown as PublishJobsService,
        clock,
        {
          timezone: TIMEZONE,
          autoPost: { enabled: false, maxPostPerSlot: 20 },
        } as AppConfigService,
      );

      await disabled.handleCron();

      expect(configsRepository.findDueSlots).not.toHaveBeenCalled();
    });

    it('bật thì chạy tick với giờ lấy từ ClockService', async () => {
      await service.handleCron();

      expect(configsRepository.findDueSlots).toHaveBeenCalledWith('14:30');
    });
  });

  describe('runSlotNow', () => {
    it('chạy mốc giờ đã qua: claim theo phút HIỆN TẠI, không phải giờ của slot', async () => {
      configsRepository.findSlotWithPage.mockResolvedValue(
        makeSlot({ time: '22:00' }),
      );
      picker.pickForSlot.mockResolvedValue([makeContent('c1')]);

      const result = await service.runSlotNow('slot-1');

      expect(slotRuns.claim).toHaveBeenCalledWith(
        'slot-1',
        '2026-07-25',
        '14:30',
      );
      expect(publishJobs.createQueuedJob).toHaveBeenCalledTimes(1);
      expect(result.jobCreatedCount).toBe(1);
    });

    it('phút này đã chạy rồi ⇒ không tạo job lần hai', async () => {
      slotRuns.claim.mockResolvedValue(null);

      const result = await service.runSlotNow('slot-1');

      expect(result.claimed).toBe(false);
      expect(publishJobs.createQueuedJob).not.toHaveBeenCalled();
    });

    it('kho vẫn hết bài ⇒ SKIPPED/NO_CONTENT chứ không lỗi', async () => {
      picker.pickForSlot.mockResolvedValue([]);

      const result = await service.runSlotNow('slot-1');

      expect(result.skipReason).toBe(SkipReason.NO_CONTENT);
      expect(slotRuns.finishSkipped).toHaveBeenCalledWith(
        'run-1',
        SkipReason.NO_CONTENT,
      );
    });

    it('không tìm thấy mốc giờ ⇒ NotFoundException', async () => {
      configsRepository.findSlotWithPage.mockResolvedValue(null);

      await expect(service.runSlotNow('slot-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(slotRuns.claim).not.toHaveBeenCalled();
    });

    it.each([
      [
        'page tạm dừng',
        makeSlot({ facebookPage: makePage({ isActive: false }) }),
      ],
      ['page đã xoá', makeSlot({ facebookPage: makePage({ deletedAt: NOW }) })],
      [
        'page tắt đăng tự động',
        makeSlot({ facebookPage: makePage({ autopostEnabled: false }) }),
      ],
      ['mốc giờ đang tắt', makeSlot({ enabled: false })],
    ])('%s ⇒ BadRequestException, không đăng gì', async (_label, slot) => {
      configsRepository.findSlotWithPage.mockResolvedValue(slot);

      await expect(service.runSlotNow('slot-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(publishJobs.createQueuedJob).not.toHaveBeenCalled();
    });
  });
});
