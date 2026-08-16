import { Injectable } from '@nestjs/common';
import {
  ReupVideoStatus,
  type Prisma,
  type ReupPlatform,
  type ReupVideo,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Trạng thái "chưa kết thúc" — video còn đang chạy trong hàng đợi. */
export const REUP_IN_FLIGHT_STATUSES = [
  ReupVideoStatus.PENDING,
  ReupVideoStatus.DOWNLOADING,
  ReupVideoStatus.DOWNLOADED,
  ReupVideoStatus.UPLOADING,
] as const;

export interface CreateReupVideoData {
  topicId: string;
  platform: ReupPlatform;
  externalId: string;
  sourceUrl: string;
  title: string;
  authorName: string;
  publishedAt: Date | null;
  durationSec: number | null;
  viewCount: bigint | null;
  thumbnailUrl: string | null;
}

export interface UpdateReupVideoData {
  status?: ReupVideoStatus;
  localPath?: string | null;
  fileSize?: bigint | null;
  contentAssetId?: string | null;
  mediaUploadJobId?: string | null;
  errorMessage?: string | null;
  attemptCount?: number;
}

export interface FindReupVideosFilter {
  topicId?: string;
  status?: ReupVideoStatus;
  page: number;
  limit: number;
}

export type ReupVideoWithTopic = ReupVideo & {
  topic: { id: string; name: string; platform: ReupPlatform };
  /** null khi chưa IMPORTED (bài chưa tồn tại) hoặc bài MANUAL — không xảy ra
   * thực tế vì content luôn được tạo với sourceType = REUP (plan 29). */
  contentAsset: { resourceDeletedAt: Date | null } | null;
};

const TOPIC_INCLUDE = {
  topic: { select: { id: true, name: true, platform: true } },
  // Plan 30: Tag "Đã xoá file" trên tab Video đã kéo cần biết resourceDeletedAt
  // của bài trong kho — field này sống ở content_assets, không ở reup_videos.
  contentAsset: { select: { resourceDeletedAt: true } },
} as const;

@Injectable()
export class ReupVideosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filter: FindReupVideosFilter,
  ): Promise<{ data: ReupVideoWithTopic[]; total: number }> {
    const where: Prisma.ReupVideoWhereInput = {
      topicId: filter.topicId,
      status: filter.status,
    };

    const [data, total] = await Promise.all([
      this.prisma.reupVideo.findMany({
        where,
        include: TOPIC_INCLUDE,
        orderBy: { discoveredAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.reupVideo.count({ where }),
    ]);

    return { data, total };
  }

  findById(id: string): Promise<ReupVideoWithTopic | null> {
    return this.prisma.reupVideo.findUnique({
      where: { id },
      include: TOPIC_INCLUDE,
    });
  }

  /**
   * Mọi `externalId` đã biết của một nền tảng — nguồn cho bộ lọc chống tải trùng.
   *
   * Cố ý **không** giới hạn theo `topicId`: hai chủ đề khác nhau có thể tìm ra
   * cùng một video, tải 2 lần là đăng trùng lên page.
   */
  async findKnownExternalIds(platform: ReupPlatform): Promise<Set<string>> {
    const rows = await this.prisma.reupVideo.findMany({
      where: { platform },
      select: { externalId: true },
    });
    return new Set(rows.map((row) => row.externalId));
  }

  /** Tạo nhiều video một lần. `skipDuplicates` chặn đua giữa 2 lượt quét. */
  createMany(items: CreateReupVideoData[]): Promise<{ count: number }> {
    return this.prisma.reupVideo.createMany({
      data: items,
      skipDuplicates: true,
    });
  }

  /** Lấy lại các video vừa tạo để có `id` mà đẩy vào queue. */
  findByExternalIds(
    platform: ReupPlatform,
    externalIds: string[],
  ): Promise<ReupVideo[]> {
    return this.prisma.reupVideo.findMany({
      where: { platform, externalId: { in: externalIds } },
    });
  }

  update(id: string, data: UpdateReupVideoData): Promise<ReupVideo> {
    return this.prisma.reupVideo.update({ where: { id }, data });
  }

  findByMediaUploadJobId(jobId: string): Promise<ReupVideo | null> {
    return this.prisma.reupVideo.findFirst({
      where: { mediaUploadJobId: jobId },
    });
  }
}
