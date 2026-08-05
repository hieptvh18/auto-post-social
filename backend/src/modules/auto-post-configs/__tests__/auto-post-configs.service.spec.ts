import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type {
  AutoPostSlot,
  FacebookPage,
} from '../../../../generated/prisma/client';
import { FacebookConnectMode } from '../../../../generated/prisma/client';
import {
  SlotMediaType,
  UserRole,
  type SlotRun,
} from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import type { AppConfigService } from '../../../config/app-config.service';
import type { ClockService } from '../../../infra/clock/clock.service';
import type {
  CategoryAvailabilityRow,
  ContentPickerRepository,
} from '../../auto-post/content-picker.repository';
import type { SlotRunService } from '../../auto-post/slot-run.service';
import type { CreateAuditLogData } from '../../audit/audit.repository';
import type { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/audit.service';
import { AutoPostConfigsService } from '../auto-post-configs.service';
import type {
  AutoPostConfigsRepository,
  CreateSlotData,
  PageWithSlots,
  UpdateSlotData,
} from '../auto-post-configs.repository';

const makeSlot = (overrides: Partial<AutoPostSlot> = {}): AutoPostSlot => ({
  id: 'slot-1',
  facebookPageId: 'page-1',
  time: '08:00',
  categories: ['Cơ xương khớp'],
  mediaType: SlotMediaType.all,
  postCount: 1,
  assetsPerPost: 1,
  enabled: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

const makePage = (overrides: Partial<PageWithSlots> = {}): PageWithSlots => ({
  id: 'page-1',
  pageName: 'Luca — Hà Nội',
  pageId: '123456789',
  accessTokenEnc: 'enc',
  tokenExpireAt: null,
  isActive: true,
  autopostEnabled: false,
  deletedAt: null,
  connectMode: FacebookConnectMode.MANUAL_TOKEN,
  connectionId: null,
  createdById: 'admin-1',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  autoPostSlots: [],
  ...overrides,
});

const admin: AuthenticatedUser = {
  id: 'admin-1',
  email: 'admin@company.local',
  name: 'Admin',
  role: UserRole.ADMIN,
};

describe('AutoPostConfigsService', () => {
  let repository: {
    findPagesWithSlots: jest.Mock<Promise<PageWithSlots[]>, []>;
    findPageById: jest.Mock<Promise<PageWithSlots | null>, [string]>;
    setAutopostEnabled: jest.Mock<Promise<FacebookPage>, [string, boolean]>;
    findSlotById: jest.Mock<Promise<AutoPostSlot | null>, [string]>;
    findSlotByPageAndTime: jest.Mock<
      Promise<AutoPostSlot | null>,
      [string, string]
    >;
    createSlot: jest.Mock<Promise<AutoPostSlot>, [CreateSlotData]>;
    updateSlot: jest.Mock<Promise<AutoPostSlot>, [string, UpdateSlotData]>;
    deleteSlot: jest.Mock<Promise<void>, [string]>;
  };
  let auditService: { log: jest.Mock<Promise<void>, [CreateAuditLogData]> };
  let picker: {
    countForSlot: jest.Mock<Promise<number>, [unknown]>;
    countAssignedPending: jest.Mock<Promise<number>, [string]>;
    countByCategoryForPage: jest.Mock<
      Promise<CategoryAvailabilityRow[]>,
      [string]
    >;
  };
  let slotRuns: { findByRunDate: jest.Mock<Promise<SlotRun[]>, [string]> };
  let service: AutoPostConfigsService;

  // 2026-07-25 17:00 giờ VN — cố định để `findByRunDate` luôn hỏi đúng một ngày.
  const clock: ClockService = { now: () => new Date('2026-07-25T10:00:00Z') };

  beforeEach(() => {
    repository = {
      findPagesWithSlots: jest.fn<Promise<PageWithSlots[]>, []>(),
      findPageById: jest.fn<Promise<PageWithSlots | null>, [string]>(),
      setAutopostEnabled: jest.fn<Promise<FacebookPage>, [string, boolean]>(),
      findSlotById: jest.fn<Promise<AutoPostSlot | null>, [string]>(),
      findSlotByPageAndTime: jest.fn<
        Promise<AutoPostSlot | null>,
        [string, string]
      >(),
      createSlot: jest.fn<Promise<AutoPostSlot>, [CreateSlotData]>(),
      updateSlot: jest.fn<Promise<AutoPostSlot>, [string, UpdateSlotData]>(),
      deleteSlot: jest.fn<Promise<void>, [string]>(),
    };
    auditService = { log: jest.fn<Promise<void>, [CreateAuditLogData]>() };
    picker = {
      countForSlot: jest.fn<Promise<number>, [unknown]>().mockResolvedValue(3),
      countAssignedPending: jest
        .fn<Promise<number>, [string]>()
        .mockResolvedValue(3),
      countByCategoryForPage: jest
        .fn<Promise<CategoryAvailabilityRow[]>, [string]>()
        .mockResolvedValue([]),
    };
    slotRuns = {
      findByRunDate: jest
        .fn<Promise<SlotRun[]>, [string]>()
        .mockResolvedValue([]),
    };
    service = new AutoPostConfigsService(
      repository as unknown as AutoPostConfigsRepository,
      auditService as unknown as AuditService,
      {
        autoPost: { enabled: true, maxPostPerSlot: 20 },
        timezone: 'Asia/Ho_Chi_Minh',
      } as AppConfigService,
      picker as unknown as ContentPickerRepository,
      slotRuns as unknown as SlotRunService,
      clock,
    );
  });

  describe('findAllConfigs — cảnh báo tình trạng kho', () => {
    beforeEach(() => {
      repository.findPagesWithSlots.mockResolvedValue([
        makePage({ autopostEnabled: true, autoPostSlots: [makeSlot()] }),
      ]);
    });

    it('slot hết bài và page chưa được phân bổ bài nào ⇒ readiness NO_ASSIGNMENT', async () => {
      picker.countForSlot.mockResolvedValue(0);
      picker.countAssignedPending.mockResolvedValue(0);

      const [config] = await service.findAllConfigs();

      expect(config.slots[0].readyCount).toBe(0);
      expect(config.slots[0].readiness.status).toBe('NO_ASSIGNMENT');
    });

    it('page còn bài chờ nhưng không khớp mốc giờ ⇒ NO_MATCH', async () => {
      picker.countForSlot.mockResolvedValue(0);
      picker.countAssignedPending.mockResolvedValue(2);

      const [config] = await service.findAllConfigs();

      expect(config.slots[0].readiness.status).toBe('NO_MATCH');
    });

    it('còn bài khớp ⇒ READY kèm số bài sẵn sàng', async () => {
      picker.countForSlot.mockResolvedValue(4);

      const [config] = await service.findAllConfigs();

      expect(config.slots[0].readiness.status).toBe('READY');
      expect(config.slots[0].readyCount).toBe(4);
    });

    it('đếm bài theo đúng danh mục và loại media của từng mốc giờ', async () => {
      await service.findAllConfigs();

      expect(picker.countForSlot).toHaveBeenCalledWith({
        facebookPageId: 'page-1',
        categories: ['Cơ xương khớp'],
        mediaType: 'all',
      });
    });

    it('lần cron chạy gần nhất hôm nay được trả kèm; chưa chạy thì null', async () => {
      const [before] = await service.findAllConfigs();
      expect(before.slots[0].lastRun).toBeNull();

      slotRuns.findByRunDate.mockResolvedValue([
        {
          id: 'run-1',
          slotId: 'slot-1',
          runDate: '2026-07-25',
          runTime: '22:00',
          status: 'SKIPPED',
          pickedCount: 0,
          jobCreatedCount: 0,
          skipReason: 'NO_CONTENT',
          startedAt: new Date('2026-07-25T15:00:00Z'),
          finishedAt: new Date('2026-07-25T15:00:01Z'),
          errorMessage: null,
          createdAt: new Date('2026-07-25T15:00:00Z'),
        },
      ]);

      const [after] = await service.findAllConfigs();

      expect(after.slots[0].lastRun?.status).toBe('SKIPPED');
      expect(after.slots[0].lastRun?.skipReason).toBe('NO_CONTENT');
    });
  });

  describe('findAllConfigs', () => {
    it('trả về page kèm slot, không lộ access token đã mã hoá', async () => {
      repository.findPagesWithSlots.mockResolvedValue([
        makePage({ autopostEnabled: true, autoPostSlots: [makeSlot()] }),
      ]);

      const result = await service.findAllConfigs();

      expect(result).toHaveLength(1);
      expect(result[0].pageId).toBe('page-1');
      expect(result[0].facebookPageId).toBe('123456789');
      expect(result[0].enabled).toBe(true);
      expect(result[0].slots[0].time).toBe('08:00');
      expect(JSON.stringify(result)).not.toContain('enc');
    });
  });

  describe('findCategoryAvailability', () => {
    it('gộp biến thể hoa/thường của cùng danh mục và xếp theo tổng bài giảm dần', async () => {
      repository.findPageById.mockResolvedValue(makePage());
      picker.countByCategoryForPage.mockResolvedValue([
        { category: 'Marketing', imageCount: 1, videoCount: 0 },
        { category: ' marketing ', imageCount: 2, videoCount: 1 },
        { category: 'Thăm khám', imageCount: 0, videoCount: 7 },
      ]);

      const result = await service.findCategoryAvailability('page-1');

      expect(result).toEqual([
        { category: 'Thăm khám', imageCount: 0, videoCount: 7 },
        { category: 'Marketing', imageCount: 3, videoCount: 1 },
      ]);
      expect(picker.countByCategoryForPage).toHaveBeenCalledWith('page-1');
    });

    it('ném 404 khi page không tồn tại', async () => {
      repository.findPageById.mockResolvedValue(null);

      await expect(
        service.findCategoryAvailability('page-9'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(picker.countByCategoryForPage).not.toHaveBeenCalled();
    });
  });

  describe('setEnabled', () => {
    it('bật auto-post khi page chưa có slot ⇒ vẫn bật nhưng kèm cảnh báo', async () => {
      repository.findPageById.mockResolvedValue(
        makePage({ autoPostSlots: [] }),
      );
      repository.setAutopostEnabled.mockResolvedValue(makePage());

      const result = await service.setEnabled(
        'page-1',
        { enabled: true },
        admin,
      );

      expect(repository.setAutopostEnabled).toHaveBeenCalledWith(
        'page-1',
        true,
      );
      expect(result.enabled).toBe(true);
      expect(result.warning).toContain('chưa có mốc giờ');
    });

    it('page đã có slot ⇒ không cảnh báo và ghi audit AUTOPOST_CONFIG_UPDATE', async () => {
      repository.findPageById.mockResolvedValue(
        makePage({ autoPostSlots: [makeSlot()] }),
      );
      repository.setAutopostEnabled.mockResolvedValue(makePage());

      const result = await service.setEnabled(
        'page-1',
        { enabled: true },
        admin,
      );

      expect(result.warning).toBeNull();
      const logged = auditService.log.mock.calls[0][0];
      expect(logged.action).toBe(AuditAction.AUTOPOST_CONFIG_UPDATE);
      expect(logged.resource).toBe('facebook_page:page-1');
    });

    it('page không tồn tại / đã xoá ⇒ 404', async () => {
      repository.findPageById.mockResolvedValue(null);

      await expect(
        service.setEnabled('page-x', { enabled: true }, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.setAutopostEnabled).not.toHaveBeenCalled();
    });
  });

  describe('createSlot', () => {
    const dto = {
      time: '08:00',
      categories: ['Cơ xương khớp'],
      mediaType: SlotMediaType.video,
      postCount: 2,
    };

    it('tạo slot mới và ghi audit', async () => {
      repository.findPageById.mockResolvedValue(makePage());
      repository.findSlotByPageAndTime.mockResolvedValue(null);
      repository.createSlot.mockResolvedValue(
        makeSlot({ mediaType: SlotMediaType.video, postCount: 2 }),
      );

      const result = await service.createSlot('page-1', dto, admin);

      expect(repository.createSlot).toHaveBeenCalledWith({
        facebookPageId: 'page-1',
        time: '08:00',
        categories: ['Cơ xương khớp'],
        mediaType: SlotMediaType.video,
        postCount: 2,
        assetsPerPost: undefined,
        enabled: undefined,
      });
      expect(result.postCount).toBe(2);
      expect(auditService.log.mock.calls[0][0].action).toBe(
        AuditAction.AUTOPOST_SLOT_CREATE,
      );
    });

    it('trùng giờ trong cùng page ⇒ 409', async () => {
      repository.findPageById.mockResolvedValue(makePage());
      repository.findSlotByPageAndTime.mockResolvedValue(makeSlot());

      await expect(
        service.createSlot('page-1', dto, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.createSlot).not.toHaveBeenCalled();
    });

    it('postCount vượt MAX_POST_PER_SLOT ⇒ 400', async () => {
      repository.findPageById.mockResolvedValue(makePage());

      await expect(
        service.createSlot('page-1', { ...dto, postCount: 21 }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSlot).not.toHaveBeenCalled();
    });

    it('assetsPerPost > 1 với mediaType video/all ⇒ 400 (Facebook không ghép được)', async () => {
      repository.findPageById.mockResolvedValue(makePage());

      await expect(
        service.createSlot('page-1', { ...dto, assetsPerPost: 3 }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.createSlot(
          'page-1',
          { ...dto, mediaType: SlotMediaType.all, assetsPerPost: 2 },
          admin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSlot).not.toHaveBeenCalled();
    });

    it('assetsPerPost > MAX_ASSETS_PER_POST ⇒ 400 dù là ảnh', async () => {
      repository.findPageById.mockResolvedValue(makePage());

      await expect(
        service.createSlot(
          'page-1',
          { ...dto, mediaType: SlotMediaType.image, assetsPerPost: 11 },
          admin,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.createSlot).not.toHaveBeenCalled();
    });

    it('assetsPerPost > 1 với mediaType image ⇒ tạo được, truyền xuống repository', async () => {
      repository.findPageById.mockResolvedValue(makePage());
      repository.findSlotByPageAndTime.mockResolvedValue(null);
      repository.createSlot.mockResolvedValue(
        makeSlot({ mediaType: SlotMediaType.image, assetsPerPost: 4 }),
      );

      const result = await service.createSlot(
        'page-1',
        { ...dto, mediaType: SlotMediaType.image, assetsPerPost: 4 },
        admin,
      );

      expect(repository.createSlot.mock.calls[0][0].assetsPerPost).toBe(4);
      expect(result.assetsPerPost).toBe(4);
    });

    it('page không tồn tại ⇒ 404', async () => {
      repository.findPageById.mockResolvedValue(null);

      await expect(
        service.createSlot('page-x', dto, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateSlot', () => {
    it('đổi sang giờ đã có slot khác ⇒ 409', async () => {
      repository.findSlotById.mockResolvedValue(makeSlot({ time: '08:00' }));
      repository.findSlotByPageAndTime.mockResolvedValue(
        makeSlot({ id: 'slot-2', time: '12:00' }),
      );

      await expect(
        service.updateSlot('slot-1', { time: '12:00' }, admin),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.updateSlot).not.toHaveBeenCalled();
    });

    it('giữ nguyên giờ cũ thì không coi chính nó là trùng', async () => {
      repository.findSlotById.mockResolvedValue(makeSlot({ time: '08:00' }));
      repository.updateSlot.mockResolvedValue(makeSlot({ enabled: false }));

      const result = await service.updateSlot(
        'slot-1',
        { time: '08:00', enabled: false },
        admin,
      );

      expect(repository.findSlotByPageAndTime).not.toHaveBeenCalled();
      expect(result.enabled).toBe(false);
    });

    it('postCount vượt ngưỡng ⇒ 400', async () => {
      repository.findSlotById.mockResolvedValue(makeSlot());

      await expect(
        service.updateSlot('slot-1', { postCount: 100 }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updateSlot).not.toHaveBeenCalled();
    });

    it('đổi RIÊNG mediaType sang video trên mốc giờ đang nhiều ảnh/bài ⇒ 400', async () => {
      repository.findSlotById.mockResolvedValue(
        makeSlot({ mediaType: SlotMediaType.image, assetsPerPost: 3 }),
      );

      await expect(
        service.updateSlot('slot-1', { mediaType: SlotMediaType.video }, admin),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.updateSlot).not.toHaveBeenCalled();
    });

    it('slot không tồn tại ⇒ 404', async () => {
      repository.findSlotById.mockResolvedValue(null);

      await expect(
        service.updateSlot('slot-x', { enabled: true }, admin),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('removeSlot', () => {
    it('xoá slot và ghi audit kèm giá trị trước khi xoá', async () => {
      repository.findSlotById.mockResolvedValue(makeSlot());

      await service.removeSlot('slot-1', admin);

      expect(repository.deleteSlot).toHaveBeenCalledWith('slot-1');
      const logged = auditService.log.mock.calls[0][0];
      expect(logged.action).toBe(AuditAction.AUTOPOST_SLOT_DELETE);
      expect(logged.resource).toBe('auto_post_slot:slot-1');
    });

    it('slot không tồn tại ⇒ 404, không gọi xoá', async () => {
      repository.findSlotById.mockResolvedValue(null);

      await expect(service.removeSlot('slot-x', admin)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.deleteSlot).not.toHaveBeenCalled();
    });
  });
});
