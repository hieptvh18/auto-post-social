import { Injectable } from '@nestjs/common';
import {
  ContentStatus,
  PublishStatus,
  type Prisma,
  type ContentAsset,
  type FacebookPage,
  type PublishJob,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Job kèm đủ ngữ cảnh để worker đăng — không phải query lại từng bảng. */
export type JobWithContext = PublishJob & {
  contentAsset: ContentAsset;
  facebookPage: FacebookPage;
};

export interface CreateJobData {
  contentAssetId: string;
  facebookPageId: string;
  caption: string;
  hashtags?: string | null;
  scheduleTime: Date;
  status: PublishStatus;
  /** `'Bot'` cho job tự động, tên user cho job đăng tay. */
  createdBy: string;
}

export interface MarkSuccessData {
  jobId: string;
  contentAssetId: string;
  facebookPageId: string;
  facebookPostId: string;
  publishedAt: Date;
}

export interface FindJobsFilter {
  from?: Date;
  to?: Date;
  facebookPageId?: string;
  status?: PublishStatus;
  /** Khớp tiêu đề bài trong kho (không phân biệt hoa thường). */
  search?: string;
}

export interface PagingParams {
  page: number;
  pageSize: number;
}

/** Số job theo từng trạng thái — Monitor đối chiếu với BullMQ. */
export type StatusCounts = Record<PublishStatus, number>;

/**
 * Điều kiện lọc dùng chung cho `findMany` và `countMany` — viết ở hai nơi thì
 * tổng số bản ghi sẽ lệch với danh sách đang hiển thị.
 */
function buildJobsWhere(filter: FindJobsFilter): Prisma.PublishJobWhereInput {
  return {
    facebookPageId: filter.facebookPageId,
    status: filter.status,
    createdAt:
      filter.from === undefined || filter.to === undefined
        ? undefined
        : { gte: filter.from, lt: filter.to },
    contentAsset:
      filter.search === undefined || filter.search === ''
        ? undefined
        : { title: { contains: filter.search, mode: 'insensitive' } },
  };
}

/** Nơi duy nhất viết Prisma query cho `publish_jobs` (rule 01). */
@Injectable()
export class PublishJobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateJobData): Promise<PublishJob> {
    return this.prisma.publishJob.create({
      data: {
        contentAssetId: data.contentAssetId,
        facebookPageId: data.facebookPageId,
        caption: data.caption,
        hashtags: data.hashtags ?? null,
        scheduleTime: data.scheduleTime,
        status: data.status,
        createdBy: data.createdBy,
      },
    });
  }

  setBullJobId(jobId: string, bullJobId: string): Promise<PublishJob> {
    return this.prisma.publishJob.update({
      where: { id: jobId },
      data: { bullJobId },
    });
  }

  findById(jobId: string): Promise<PublishJob | null> {
    return this.prisma.publishJob.findUnique({ where: { id: jobId } });
  }

  findForExecution(jobId: string): Promise<JobWithContext | null> {
    return this.prisma.publishJob.findUnique({
      where: { id: jobId },
      include: { contentAsset: true, facebookPage: true },
    });
  }

  findMany(
    filter: FindJobsFilter,
    paging?: PagingParams,
  ): Promise<JobWithContext[]> {
    return this.prisma.publishJob.findMany({
      where: buildJobsWhere(filter),
      include: { contentAsset: true, facebookPage: true },
      orderBy: { createdAt: 'desc' },
      skip: paging === undefined ? 0 : (paging.page - 1) * paging.pageSize,
      take: paging === undefined ? 200 : paging.pageSize,
    });
  }

  /** Dùng chung `buildJobsWhere` với `findMany` — hai nơi lệch điều kiện là sai tổng số trang. */
  countMany(filter: FindJobsFilter): Promise<number> {
    return this.prisma.publishJob.count({ where: buildJobsWhere(filter) });
  }

  /**
   * Đếm job theo trạng thái. Monitor so số này với `getJobCounts()` của BullMQ:
   * lệch nhau nghĩa là Redis bị xoá hoặc worker chết giữa chừng.
   */
  async countByStatus(): Promise<StatusCounts> {
    const rows = await this.prisma.publishJob.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const counts = Object.fromEntries(
      Object.values(PublishStatus).map((status) => [status, 0]),
    ) as StatusCounts;
    for (const row of rows) {
      counts[row.status] = row._count._all;
    }
    return counts;
  }

  /**
   * Job còn kẹt ở `PUBLISHING` từ trước `before` — worker nhận job rồi chết
   * giữa chừng thì không ai đưa nó ra khỏi trạng thái này (chưa có reconciliation cron).
   */
  findStuckPublishing(before: Date): Promise<JobWithContext[]> {
    return this.prisma.publishJob.findMany({
      where: { status: PublishStatus.PUBLISHING, updatedAt: { lt: before } },
      include: { contentAsset: true, facebookPage: true },
      orderBy: { updatedAt: 'asc' },
      take: 50,
    });
  }

  /** Job đang chờ tới lượt / đang chạy — bảng chính của màn Queue Monitor. */
  findActive(limit: number): Promise<JobWithContext[]> {
    return this.prisma.publishJob.findMany({
      where: {
        status: { in: [PublishStatus.QUEUED, PublishStatus.PUBLISHING] },
      },
      include: { contentAsset: true, facebookPage: true },
      orderBy: { scheduleTime: 'asc' },
      take: limit,
    });
  }

  /**
   * Đưa một job đã chốt lỗi quay lại hàng đợi (người dùng bấm "Đăng lại").
   * Xoá sạch dấu vết lần chạy trước — `attemptCount` về 0 để lần thử mới đếm
   * lại từ 1, khớp với `attemptsMade` của bull job mới.
   */
  requeue(jobId: string): Promise<PublishJob> {
    return this.prisma.publishJob.update({
      where: { id: jobId },
      data: {
        status: PublishStatus.QUEUED,
        errorMessage: null,
        attemptCount: 0,
        bullJobId: null,
      },
    });
  }

  /** Bài đã đăng thành công lên page này chưa (rule UNIQUE content × page). */
  async hasPublishedAssignment(
    contentAssetId: string,
    facebookPageId: string,
  ): Promise<boolean> {
    const count = await this.prisma.contentPageAssignment.count({
      where: {
        contentAssetId,
        facebookPageId,
        publishedAt: { not: null },
      },
    });
    return count > 0;
  }

  /**
   * Bắt đầu đăng: job + content cùng sang PUBLISHING trong một transaction để
   * UI không bao giờ thấy job đang chạy mà bài vẫn hiện "đã duyệt".
   */
  async markPublishing(
    jobId: string,
    contentAssetId: string,
    attemptCount: number,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.publishJob.update({
        where: { id: jobId },
        data: { status: PublishStatus.PUBLISHING, attemptCount },
      }),
      this.prisma.contentAsset.update({
        where: { id: contentAssetId },
        data: { status: ContentStatus.PUBLISHING },
      }),
    ]);
  }

  /**
   * Đăng thành công: job + assignment + trạng thái content phải đi cùng nhau,
   * nếu không sẽ có bài đã lên Facebook nhưng hệ thống tưởng là chưa đăng.
   */
  async markSuccess(data: MarkSuccessData): Promise<PublishJob> {
    const [job] = await this.prisma.$transaction([
      this.prisma.publishJob.update({
        where: { id: data.jobId },
        data: {
          status: PublishStatus.SUCCESS,
          facebookPostId: data.facebookPostId,
          publishedAt: data.publishedAt,
          errorMessage: null,
        },
      }),
      this.prisma.contentPageAssignment.upsert({
        where: {
          contentAssetId_facebookPageId: {
            contentAssetId: data.contentAssetId,
            facebookPageId: data.facebookPageId,
          },
        },
        create: {
          contentAssetId: data.contentAssetId,
          facebookPageId: data.facebookPageId,
          publishedAt: data.publishedAt,
          facebookPostId: data.facebookPostId,
        },
        update: {
          publishedAt: data.publishedAt,
          facebookPostId: data.facebookPostId,
        },
      }),
      this.prisma.contentAsset.update({
        where: { id: data.contentAssetId },
        data: { status: ContentStatus.PUBLISHED },
      }),
    ]);

    return job;
  }

  /**
   * Đăng hỏng: ghi lỗi vào job và **tính lại** trạng thái content từ assignments
   * thay vì set mù — bài đã đăng thành công ở page khác vẫn phải giữ PUBLISHED.
   */
  async markFailure(
    jobId: string,
    data: {
      contentAssetId: string;
      status: PublishStatus;
      errorMessage: string;
      attemptCount: number;
    },
  ): Promise<void> {
    const publishedCount = await this.prisma.contentPageAssignment.count({
      where: {
        contentAssetId: data.contentAssetId,
        publishedAt: { not: null },
      },
    });

    await this.prisma.$transaction([
      this.prisma.publishJob.update({
        where: { id: jobId },
        data: {
          status: data.status,
          errorMessage: data.errorMessage,
          attemptCount: data.attemptCount,
        },
      }),
      this.prisma.contentAsset.update({
        where: { id: data.contentAssetId },
        data: {
          status:
            publishedCount > 0
              ? ContentStatus.PUBLISHED
              : ContentStatus.APPROVED,
        },
      }),
    ]);
  }
}
