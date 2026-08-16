import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ReupPlatform,
  UserRole,
  type ReupTopic,
} from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditAction, type AuditService } from '../../audit/audit.service';
import type { ReupTopicsRepository } from '../reup-topics.repository';
import {
  MAX_ACTIVE_REUP_TOPICS,
  ReupTopicsService,
} from '../reup-topics.service';

const ACTOR: AuthenticatedUser = {
  id: 'super-1',
  name: 'Super Admin',
  email: 'super@company.local',
  role: UserRole.SUPER_ADMIN,
};

const makeTopic = (overrides: Partial<ReupTopic> = {}): ReupTopic => ({
  id: 'topic-1',
  name: 'Mẹo nấu ăn',
  platform: ReupPlatform.YOUTUBE,
  keywords: ['mẹo nấu ăn'],
  regionCode: 'VN',
  category: 'Ẩm thực',
  dailyQuota: 3,
  minViewCount: 50_000,
  maxAgeDays: 30,
  minDurationSec: 15,
  maxDurationSec: 180,
  autoApprove: false,
  captionTemplate: null,
  hashtags: null,
  isActive: true,
  createdById: ACTOR.id,
  createdAt: new Date('2026-08-15'),
  updatedAt: new Date('2026-08-15'),
  ...overrides,
});

const baseDto = {
  name: 'Mẹo nấu ăn',
  category: 'Ẩm thực',
  keywords: ['mẹo nấu ăn'],
};

describe('ReupTopicsService', () => {
  let repository: {
    findMany: jest.Mock;
    findById: jest.Mock;
    findByNameAndPlatform: jest.Mock;
    findActive: jest.Mock;
    countActive: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let auditService: { log: jest.Mock };
  let service: ReupTopicsService;

  beforeEach(() => {
    repository = {
      findMany: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      findById: jest.fn(),
      findByNameAndPlatform: jest.fn().mockResolvedValue(null),
      findActive: jest.fn().mockResolvedValue([]),
      countActive: jest.fn().mockResolvedValue(0),
      // Trả lại đúng thứ vừa ghi để test khẳng định được giá trị đã lưu.
      create: jest.fn((data: Partial<ReupTopic>) =>
        Promise.resolve(makeTopic(data)),
      ),
      update: jest.fn((id: string, data: Partial<ReupTopic>) =>
        Promise.resolve(makeTopic({ ...data, id })),
      ),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new ReupTopicsService(
      repository as unknown as ReupTopicsRepository,
      auditService as unknown as AuditService,
    );
  });

  describe('create', () => {
    it('lưu chủ đề với đầy đủ giá trị mặc định và ghi audit', async () => {
      await service.create(baseDto, ACTOR);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Mẹo nấu ăn',
          platform: ReupPlatform.YOUTUBE,
          regionCode: 'VN',
          dailyQuota: 3,
          minViewCount: 50_000,
          maxAgeDays: 30,
          minDurationSec: 15,
          maxDurationSec: 180,
          autoApprove: false,
          isActive: true,
          createdById: ACTOR.id,
        }),
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ACTOR.id,
          action: AuditAction.REUP_TOPIC_CREATE,
        }),
      );
    });

    it('trùng (tên, nền tảng) ⇒ 409', async () => {
      repository.findByNameAndPlatform.mockResolvedValue(makeTopic());

      await expect(service.create(baseDto, ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('YOUTUBE mà keywords rỗng ⇒ 400 (cron không biết tìm bằng gì)', async () => {
      await expect(
        service.create({ ...baseDto, keywords: [] }, ACTOR),
      ).rejects.toThrow(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('YOUTUBE mà keywords toàn khoảng trắng ⇒ 400', async () => {
      await expect(
        service.create({ ...baseDto, keywords: ['   ', ''] }, ACTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('minDurationSec >= maxDurationSec ⇒ 400', async () => {
      await expect(
        service.create(
          { ...baseDto, minDurationSec: 200, maxDurationSec: 180 },
          ACTOR,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('DOUYIN không cần keyword — vẫn LƯU ĐƯỢC (QĐ-2: khai báo sẵn, cron sẽ SKIPPED)', async () => {
      await expect(
        service.create(
          { ...baseDto, platform: ReupPlatform.DOUYIN, keywords: [] },
          ACTOR,
        ),
      ).resolves.toMatchObject({ platform: ReupPlatform.DOUYIN });
    });

    it('nền tảng chưa hỗ trợ ⇒ response gắn cờ isPlatformSupported = false', async () => {
      const created = await service.create(
        { ...baseDto, platform: ReupPlatform.TIKTOK },
        ACTOR,
      );

      expect(created.isPlatformSupported).toBe(false);
    });

    it('YOUTUBE ⇒ isPlatformSupported = true', async () => {
      const created = await service.create(baseDto, ACTOR);

      expect(created.isPlatformSupported).toBe(true);
    });

    it('khử trùng lặp và cắt khoảng trắng của keywords', async () => {
      await service.create(
        { ...baseDto, keywords: [' Mẹo ', 'mẹo', 'món ngon'] },
        ACTOR,
      );

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ keywords: ['Mẹo', 'món ngon'] }),
      );
    });

    it(`đã có ${MAX_ACTIVE_REUP_TOPICS} chủ đề đang bật ⇒ 422`, async () => {
      repository.countActive.mockResolvedValue(MAX_ACTIVE_REUP_TOPICS);

      await expect(service.create(baseDto, ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('tạo chủ đề TẮT sẵn ⇒ không tính vào trần', async () => {
      repository.countActive.mockResolvedValue(MAX_ACTIVE_REUP_TOPICS);

      await expect(
        service.create({ ...baseDto, isActive: false }, ACTOR),
      ).resolves.toBeDefined();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      repository.findById.mockResolvedValue(makeTopic());
    });

    it('không tồn tại ⇒ 404', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('missing', { name: 'x' }, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    /**
     * PATCH chỉ gửi MỘT nửa cặp field: phải so với giá trị CŨ trong DB, không so
     * với default. Đây là lý do ràng buộc chéo nằm ở service chứ không ở DTO.
     */
    it('PATCH chỉ gửi maxDurationSec nhỏ hơn min CŨ ⇒ 400', async () => {
      repository.findById.mockResolvedValue(makeTopic({ minDurationSec: 100 }));

      await expect(
        service.update('topic-1', { maxDurationSec: 50 }, ACTOR),
      ).rejects.toThrow(BadRequestException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('PATCH xoá hết keywords của chủ đề YOUTUBE ⇒ 400', async () => {
      await expect(
        service.update('topic-1', { keywords: [] }, ACTOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('bật lại chủ đề khi đã đủ trần ⇒ 422', async () => {
      repository.findById.mockResolvedValue(makeTopic({ isActive: false }));
      repository.countActive.mockResolvedValue(MAX_ACTIVE_REUP_TOPICS);

      await expect(
        service.update('topic-1', { isActive: true }, ACTOR),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('sửa chủ đề ĐANG bật (không đổi isActive) ⇒ không đếm lại trần', async () => {
      repository.countActive.mockResolvedValue(MAX_ACTIVE_REUP_TOPICS);

      await expect(
        service.update('topic-1', { dailyQuota: 5 }, ACTOR),
      ).resolves.toBeDefined();
      expect(repository.countActive).not.toHaveBeenCalled();
    });

    it('đổi tên trùng chủ đề khác ⇒ 409', async () => {
      repository.findByNameAndPlatform.mockResolvedValue(
        makeTopic({ id: 'topic-2' }),
      );

      await expect(
        service.update('topic-1', { name: 'Tên khác' }, ACTOR),
      ).rejects.toThrow(ConflictException);
    });

    it('gửi lại đúng tên hiện tại ⇒ KHÔNG báo trùng', async () => {
      await expect(
        service.update('topic-1', { name: 'Mẹo nấu ăn' }, ACTOR),
      ).resolves.toBeDefined();
      expect(repository.findByNameAndPlatform).not.toHaveBeenCalled();
    });

    it('ghi audit REUP_TOPIC_UPDATE kèm trạng thái trước/sau', async () => {
      await service.update('topic-1', { autoApprove: true }, ACTOR);

      const calls = auditService.log.mock.calls as unknown[][];
      const payload = calls[0][0] as {
        action: string;
        beforeValue: { autoApprove: boolean };
        afterValue: { autoApprove: boolean };
      };

      expect(payload.action).toBe(AuditAction.REUP_TOPIC_UPDATE);
      expect(payload.beforeValue.autoApprove).toBe(false);
      expect(payload.afterValue.autoApprove).toBe(true);
    });
  });

  describe('remove', () => {
    it('SOFT DELETE — chỉ tắt isActive, KHÔNG xoá bản ghi', async () => {
      repository.findById.mockResolvedValue(makeTopic());

      await service.remove('topic-1', ACTOR);

      expect(repository.update).toHaveBeenCalledWith('topic-1', {
        isActive: false,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.REUP_TOPIC_DELETE }),
      );
    });

    it('không tồn tại ⇒ 404', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.remove('missing', ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
