import type {
  AutoPostSlot,
  FacebookPage,
} from '../../../../generated/prisma/client';
import { FacebookConnectMode } from '../../../../generated/prisma/client';
import { SlotMediaType } from '../../../../generated/prisma/client';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import { AutoPostConfigsRepository } from '../auto-post-configs.repository';

type SlotRow = AutoPostSlot & { facebookPage: FacebookPage };

const makeRow = (
  slot: Partial<AutoPostSlot>,
  page: Partial<FacebookPage>,
): SlotRow => ({
  id: 'slot-1',
  facebookPageId: 'page-1',
  time: '08:00',
  categories: ['Cơ xương khớp'],
  mediaType: SlotMediaType.all,
  postCount: 1,
  enabled: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...slot,
  facebookPage: {
    id: 'page-1',
    pageName: 'Luca',
    pageId: '123',
    accessTokenEnc: 'enc',
    tokenExpireAt: null,
    isActive: true,
    autopostEnabled: true,
    deletedAt: null,
    connectMode: FacebookConnectMode.MANUAL_TOKEN,
    connectionId: null,
    createdById: 'admin-1',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...page,
  },
});

interface DueSlotsWhere {
  time: string;
  enabled: boolean;
  facebookPage: {
    isActive: boolean;
    autopostEnabled: boolean;
    deletedAt: null;
  };
}

/**
 * Prisma giả: áp đúng ngữ nghĩa của `where` mà `findDueSlots` gửi xuống lên tập
 * dữ liệu mẫu. Test này bảo vệ **điều kiện lọc** — sai một vế là bot đăng nhầm
 * lên page đã tắt (rule 02 §Bắt buộc phải phủ).
 */
function applyWhere(rows: SlotRow[], where: DueSlotsWhere): SlotRow[] {
  return rows.filter(
    (row) =>
      row.time === where.time &&
      row.enabled === where.enabled &&
      row.facebookPage.isActive === where.facebookPage.isActive &&
      row.facebookPage.autopostEnabled === where.facebookPage.autopostEnabled &&
      row.facebookPage.deletedAt === where.facebookPage.deletedAt,
  );
}

describe('AutoPostConfigsRepository', () => {
  describe('findDueSlots', () => {
    const rows: SlotRow[] = [
      makeRow({ id: 'ok' }, {}),
      makeRow({ id: 'khac-gio', time: '12:00' }, {}),
      makeRow({ id: 'slot-tat', enabled: false }, {}),
      makeRow({ id: 'page-tam-dung' }, { isActive: false }),
      makeRow({ id: 'page-tat-auto' }, { autopostEnabled: false }),
      makeRow({ id: 'page-da-xoa' }, { deletedAt: new Date('2026-07-01') }),
    ];

    let repository: AutoPostConfigsRepository;

    beforeEach(() => {
      const prisma = {
        autoPostSlot: {
          findMany: jest.fn(
            (args: { where: DueSlotsWhere }): Promise<SlotRow[]> =>
              Promise.resolve(applyWhere(rows, args.where)),
          ),
        },
      };
      repository = new AutoPostConfigsRepository(
        prisma as unknown as PrismaService,
      );
    });

    it('chỉ lấy slot đúng giờ, đang bật, của page đang hoạt động + bật auto + chưa xoá', async () => {
      const result = await repository.findDueSlots('08:00');

      expect(result.map((r) => r.id)).toEqual(['ok']);
    });

    it('không có slot nào tới giờ ⇒ mảng rỗng', async () => {
      const result = await repository.findDueSlots('23:45');

      expect(result).toEqual([]);
    });
  });

  describe('findPagesWithSlots', () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new AutoPostConfigsRepository({
      facebookPage: { findMany },
    } as unknown as PrismaService);

    beforeEach(() => findMany.mockClear());

    it('activeOnly = true ⇒ loại page đang tạm dừng', async () => {
      await repository.findPagesWithSlots(true);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null, isActive: true },
        }),
      );
    });

    it('mặc định vẫn lấy cả page tạm dừng', async () => {
      await repository.findPagesWithSlots();

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
    });
  });
});
