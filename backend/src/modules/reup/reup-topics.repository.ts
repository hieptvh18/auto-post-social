import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  ReupPlatform,
  ReupTopic,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface FindReupTopicsFilter {
  platform?: ReupPlatform;
  isActive?: boolean;
  search?: string;
  page: number;
  limit: number;
}

export interface CreateReupTopicData {
  name: string;
  platform: ReupPlatform;
  keywords: string[];
  regionCode: string;
  category: string;
  dailyQuota: number;
  minViewCount: number;
  maxAgeDays: number;
  minDurationSec: number;
  maxDurationSec: number;
  autoApprove: boolean;
  captionTemplate: string | null;
  hashtags: string | null;
  isActive: boolean;
  createdById: string;
}

/** Chỉ những field được phép sửa — `createdById` cố tình không có mặt. */
export type UpdateReupTopicData = Partial<
  Omit<CreateReupTopicData, 'createdById'>
>;

@Injectable()
export class ReupTopicsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filter: FindReupTopicsFilter,
  ): Promise<{ data: ReupTopic[]; total: number }> {
    const where: Prisma.ReupTopicWhereInput = {
      platform: filter.platform,
      isActive: filter.isActive,
      name:
        filter.search === undefined
          ? undefined
          : { contains: filter.search, mode: 'insensitive' },
    };

    const [data, total] = await Promise.all([
      this.prisma.reupTopic.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.reupTopic.count({ where }),
    ]);

    return { data, total };
  }

  findById(id: string): Promise<ReupTopic | null> {
    return this.prisma.reupTopic.findUnique({ where: { id } });
  }

  findByNameAndPlatform(
    name: string,
    platform: ReupPlatform,
  ): Promise<ReupTopic | null> {
    return this.prisma.reupTopic.findUnique({
      where: { name_platform: { name, platform } },
    });
  }

  /** Chủ đề đang bật — nguồn của cron discovery (plan 29). */
  findActive(): Promise<ReupTopic[]> {
    return this.prisma.reupTopic.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Đếm chủ đề đang bật — chặn trần 20 (plan 29 §3.2). */
  countActive(): Promise<number> {
    return this.prisma.reupTopic.count({ where: { isActive: true } });
  }

  create(data: CreateReupTopicData): Promise<ReupTopic> {
    return this.prisma.reupTopic.create({ data });
  }

  update(id: string, data: UpdateReupTopicData): Promise<ReupTopic> {
    return this.prisma.reupTopic.update({ where: { id }, data });
  }
}
