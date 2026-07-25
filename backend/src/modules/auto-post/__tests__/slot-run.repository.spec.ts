import { Prisma, SlotRunStatus } from '../../../../generated/prisma/client';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { SlotRunRepository } from '../slot-run.repository';

describe('SlotRunRepository', () => {
  type CreateArg = { data: { status: SlotRunStatus } };
  type UpdateArg = {
    data: {
      status: SlotRunStatus;
      skipReason: string | null;
      finishedAt: Date;
      jobCreatedCount: number;
    };
  };
  let create: jest.Mock<Promise<unknown>, [CreateArg]>;
  let update: jest.Mock<Promise<unknown>, [UpdateArg]>;
  let repository: SlotRunRepository;

  beforeEach(() => {
    create = jest.fn<Promise<unknown>, [CreateArg]>();
    update = jest.fn<Promise<unknown>, [UpdateArg]>();
    repository = new SlotRunRepository({
      slotRun: { create, update, findMany: jest.fn() },
    } as unknown as PrismaService);
  });

  describe('claim', () => {
    it('INSERT thành công ⇒ trả bản ghi, tick này được phép chạy slot', async () => {
      create.mockResolvedValue({ id: 'run-1' });

      const result = await repository.claim({
        slotId: 'slot-1',
        runDate: '2026-07-25',
        runTime: '14:30',
      });

      expect(result).toEqual({ id: 'run-1' });
      expect(create.mock.calls[0][0].data.status).toBe(SlotRunStatus.CLAIMED);
    });

    it('CHỐNG DOUBLE-FIRE: đụng UNIQUE (P2002) ⇒ trả null thay vì ném lỗi', async () => {
      create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '7.9.0',
        }),
      );

      const result = await repository.claim({
        slotId: 'slot-1',
        runDate: '2026-07-25',
        runTime: '14:30',
      });

      expect(result).toBeNull();
    });

    it('lỗi DB khác P2002 vẫn phải ném ra — không được nuốt thành "đã chạy rồi"', async () => {
      create.mockRejectedValue(new Error('connection refused'));

      await expect(
        repository.claim({
          slotId: 'slot-1',
          runDate: '2026-07-25',
          runTime: '14:30',
        }),
      ).rejects.toThrow('connection refused');
    });
  });

  describe('finish', () => {
    it('ghi kết quả kèm mốc kết thúc để truy nguyên được lần chạy', async () => {
      update.mockResolvedValue({ id: 'run-1' });

      await repository.finish('run-1', {
        status: SlotRunStatus.SKIPPED,
        skipReason: 'NO_CONTENT',
      });

      const { data } = update.mock.calls[0][0];
      expect(data.status).toBe(SlotRunStatus.SKIPPED);
      expect(data.skipReason).toBe('NO_CONTENT');
      expect(data.jobCreatedCount).toBe(0);
      expect(data.finishedAt).toBeInstanceOf(Date);
    });
  });
});
