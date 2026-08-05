import { Injectable } from '@nestjs/common';
import type {
  AutoPostSlot,
  FacebookPage,
  SlotMediaType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Page kèm danh sách slot đã sắp theo giờ tăng dần. */
export type PageWithSlots = FacebookPage & { autoPostSlots: AutoPostSlot[] };

/** Slot kèm page — cron cần biết page nào để tạo job. */
export type SlotWithPage = AutoPostSlot & { facebookPage: FacebookPage };

export interface CreateSlotData {
  facebookPageId: string;
  time: string;
  categories: string[];
  mediaType: SlotMediaType;
  postCount: number;
  /** Số ảnh gom vào 1 bài album; bỏ trống ⇒ DB default 1. */
  assetsPerPost?: number;
  enabled?: boolean;
}

export interface UpdateSlotData {
  time?: string;
  categories?: string[];
  mediaType?: SlotMediaType;
  postCount?: number;
  assetsPerPost?: number;
  enabled?: boolean;
}

/** Nơi duy nhất viết Prisma query cho auto_post_slots + cờ autopost của page (rule 01). */
@Injectable()
export class AutoPostConfigsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Chỉ page chưa xoá. Page tạm dừng (`isActive=false`) vẫn hiện để còn sửa config. */
  findPagesWithSlots(): Promise<PageWithSlots[]> {
    return this.prisma.facebookPage.findMany({
      where: { deletedAt: null },
      orderBy: { pageName: 'asc' },
      include: { autoPostSlots: { orderBy: { time: 'asc' } } },
    });
  }

  findPageById(pageId: string): Promise<PageWithSlots | null> {
    return this.prisma.facebookPage.findFirst({
      where: { id: pageId, deletedAt: null },
      include: { autoPostSlots: { orderBy: { time: 'asc' } } },
    });
  }

  setAutopostEnabled(pageId: string, enabled: boolean): Promise<FacebookPage> {
    return this.prisma.facebookPage.update({
      where: { id: pageId },
      data: { autopostEnabled: enabled },
    });
  }

  findSlotById(slotId: string): Promise<AutoPostSlot | null> {
    return this.prisma.autoPostSlot.findUnique({ where: { id: slotId } });
  }

  /** Kèm page để engine kiểm được điều kiện chạy (tạm dừng / tắt auto / đã xoá). */
  findSlotWithPage(slotId: string): Promise<SlotWithPage | null> {
    return this.prisma.autoPostSlot.findUnique({
      where: { id: slotId },
      include: { facebookPage: true },
    });
  }

  /** Dùng để chặn 2 slot cùng page bắn cùng một lúc. */
  findSlotByPageAndTime(
    facebookPageId: string,
    time: string,
  ): Promise<AutoPostSlot | null> {
    return this.prisma.autoPostSlot.findFirst({
      where: { facebookPageId, time },
    });
  }

  createSlot(data: CreateSlotData): Promise<AutoPostSlot> {
    return this.prisma.autoPostSlot.create({ data });
  }

  updateSlot(slotId: string, data: UpdateSlotData): Promise<AutoPostSlot> {
    return this.prisma.autoPostSlot.update({ where: { id: slotId }, data });
  }

  async deleteSlot(slotId: string): Promise<void> {
    await this.prisma.autoPostSlot.delete({ where: { id: slotId } });
  }

  /**
   * Đầu vào của cron (plan 07): slot tới giờ `hhmm` và **thực sự** được phép chạy.
   * Ba điều kiện phải cùng đúng — slot bật, page bật auto-post, page đang hoạt động
   * và chưa bị xoá. Thiếu một cái là bot đăng lên page đáng lẽ đã tắt.
   */
  findDueSlots(hhmm: string): Promise<SlotWithPage[]> {
    return this.prisma.autoPostSlot.findMany({
      where: {
        time: hhmm,
        enabled: true,
        facebookPage: {
          isActive: true,
          autopostEnabled: true,
          deletedAt: null,
        },
      },
      include: { facebookPage: true },
    });
  }
}
