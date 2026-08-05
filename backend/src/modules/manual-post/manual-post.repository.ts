import { Injectable } from '@nestjs/common';
import {
  ContentStatus,
  PublishStatus,
  type ContentPageAssignment,
  type PublishJob,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CreateManualJobData {
  contentAssetId: string;
  facebookPageId: string;
  caption: string;
  hashtags?: string;
  /** Tên người bấm nút — phân biệt với `'Bot'` mặc định của job tự động. */
  createdBy: string;
}

export interface MarkPublishedData {
  jobId: string;
  contentAssetId: string;
  facebookPageId: string;
  facebookPostId: string;
  publishedAt: Date;
}

/** Nơi duy nhất viết Prisma query cho luồng đăng thủ công (rule 01). */
@Injectable()
export class ManualPostRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAssignment(
    contentAssetId: string,
    facebookPageId: string,
  ): Promise<ContentPageAssignment | null> {
    return this.prisma.contentPageAssignment.findUnique({
      where: {
        contentAssetId_facebookPageId: { contentAssetId, facebookPageId },
      },
    });
  }

  /**
   * Job đang chờ/chạy hoặc đã lỗi cho đúng content+page — có job này thì KHÔNG
   * được tạo job mới, phải xử lý (chờ hoặc bấm "Đăng lại" trên chính job cũ).
   * Không có guard này thì bấm "Đăng bài thủ công" lần 2 sau khi lần 1 lỗi sẽ
   * tạo 2 job độc lập, có thể ra 2 bài trùng trên Page thật.
   */
  findBlockingJob(
    contentAssetId: string,
    facebookPageId: string,
  ): Promise<PublishJob | null> {
    return this.prisma.publishJob.findFirst({
      where: {
        contentAssetId,
        facebookPageId,
        status: {
          in: [
            PublishStatus.QUEUED,
            PublishStatus.PUBLISHING,
            PublishStatus.FAILED,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Tạo job ở trạng thái PUBLISHING ngay từ đầu — đăng thủ công là đồng bộ, không qua queue. */
  createPublishingJob(data: CreateManualJobData): Promise<PublishJob> {
    return this.prisma.publishJob.create({
      data: {
        contentAssetId: data.contentAssetId,
        facebookPageId: data.facebookPageId,
        caption: data.caption,
        hashtags: data.hashtags,
        scheduleTime: new Date(),
        status: PublishStatus.PUBLISHING,
        attemptCount: 1,
        createdBy: data.createdBy,
      },
    });
  }

  /**
   * Đăng thành công: job + assignment + trạng thái content phải đi cùng nhau,
   * nếu không sẽ có bài đã lên Facebook nhưng hệ thống tưởng là chưa đăng.
   */
  async markPublished(data: MarkPublishedData): Promise<PublishJob> {
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

  /** Thất bại: chỉ đụng job — content/assignment giữ nguyên để đăng lại được. */
  markFailed(jobId: string, errorMessage: string): Promise<PublishJob> {
    return this.prisma.publishJob.update({
      where: { id: jobId },
      data: { status: PublishStatus.FAILED, errorMessage },
    });
  }
}
