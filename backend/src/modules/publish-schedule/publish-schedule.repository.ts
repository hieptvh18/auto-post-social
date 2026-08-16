import { Injectable } from '@nestjs/common';
import {
  ContentStatus,
  SlotMediaType,
  type MediaType,
  type PublishJob,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Job kèm đúng những field của content/page mà màn lịch cần hiển thị. */
export type ScheduleJobRow = PublishJob & {
  contentAsset: {
    id: string;
    title: string;
    category: string;
    mediaType: MediaType;
    driveUrl: string | null;
    thumbnailUrl: string | null;
    resourceDeletedAt: Date | null;
  };
  facebookPage: { id: string; pageName: string; pageId: string };
};

export interface CountReadyArgs {
  facebookPageId: string;
  categories: string[];
  mediaType: SlotMediaType;
}

/** Nơi duy nhất viết Prisma query cho màn "Lịch đăng bài" (rule 01). */
@Injectable()
export class PublishScheduleRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Job có `scheduleTime` trong `[from, to)`. Truyền UTC — việc quy đổi từ ngày
   * giờ VN sang UTC là việc của service.
   */
  findJobsInRange(
    from: Date,
    to: Date,
    facebookPageId?: string,
  ): Promise<ScheduleJobRow[]> {
    return this.prisma.publishJob.findMany({
      where: {
        scheduleTime: { gte: from, lt: to },
        ...(facebookPageId === undefined ? {} : { facebookPageId }),
      },
      orderBy: { scheduleTime: 'asc' },
      include: {
        contentAsset: {
          select: {
            id: true,
            title: true,
            category: true,
            mediaType: true,
            driveUrl: true,
            thumbnailUrl: true,
            resourceDeletedAt: true,
          },
        },
        facebookPage: { select: { id: true, pageName: true, pageId: true } },
      },
    });
  }

  /**
   * Số bài trong kho còn dùng được cho một mốc giờ: đã duyệt, đã phân bổ vào page
   * đó và **chưa** đăng ở page đó. Cố ý KHÔNG nhân bản toàn bộ picker của plan 07
   * (thiếu mệnh đề "chưa có job QUEUED/PUBLISHING") — số này chỉ để cảnh báo hết bài.
   */
  async countReadyForSlot(args: CountReadyArgs): Promise<number> {
    return this.prisma.contentPageAssignment.count({
      where: {
        facebookPageId: args.facebookPageId,
        publishedAt: null,
        contentAsset: {
          // Bài đã "ngưng dùng" không được tính vào kho (plan 19 §2.2) — nếu không
          // UI báo "còn N bài" trong khi Bot lại skip vì picker bỏ qua chúng.
          isActive: true,
          status: ContentStatus.APPROVED,
          category: { in: args.categories },
          ...(args.mediaType === SlotMediaType.all
            ? {}
            : { mediaType: args.mediaType }),
        },
      },
    });
  }
}
