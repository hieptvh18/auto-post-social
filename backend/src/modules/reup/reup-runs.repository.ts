import { Injectable } from '@nestjs/common';
import {
  Prisma,
  ReupRunStatus,
  type ReupRun,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Lý do một lượt quét bị bỏ qua. Lưu dạng chuỗi ⇒ thêm mã mới không cần migration. */
export const ReupSkipReason = {
  PLATFORM_NOT_SUPPORTED: 'PLATFORM_NOT_SUPPORTED',
  DOWNLOADER_UNAVAILABLE: 'DOWNLOADER_UNAVAILABLE',
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  CONTRACT_MISMATCH: 'CONTRACT_MISMATCH',
  NO_NEW_VIDEO: 'NO_NEW_VIDEO',
} as const;

export type ReupSkipReasonValue =
  (typeof ReupSkipReason)[keyof typeof ReupSkipReason];

export interface FinishReupRunData {
  status: ReupRunStatus;
  foundCount?: number;
  pickedCount?: number;
  quotaUsed?: number;
  skipReason?: ReupSkipReasonValue | null;
  errorMessage?: string | null;
}

export type ReupRunWithTopic = ReupRun & {
  topic: { id: string; name: string };
};

@Injectable()
export class ReupRunsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * **Chống double-fire** (khuôn ADR-006, giống `slot_runs`).
   *
   * Claim bằng chính INSERT chứ không "kiểm tra rồi mới ghi": hai tick chạy sát
   * nhau đều thấy "chưa có" rồi cùng quét — race đó **chỉ DB chặn được** bằng
   * UNIQUE `(topic_id, run_date)`.
   *
   * Trả `null` = lượt quét hôm nay đã có người nhận ⇒ bỏ qua chủ đề này.
   */
  async claim(topicId: string, runDate: string): Promise<ReupRun | null> {
    try {
      return await this.prisma.reupRun.create({
        data: { topicId, runDate, status: ReupRunStatus.CLAIMED },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  /** Đóng sổ lượt quét — luôn phải gọi, kể cả khi SKIPPED/ERROR. */
  finish(runId: string, data: FinishReupRunData): Promise<ReupRun> {
    return this.prisma.reupRun.update({
      where: { id: runId },
      data: {
        status: data.status,
        foundCount: data.foundCount ?? 0,
        pickedCount: data.pickedCount ?? 0,
        quotaUsed: data.quotaUsed ?? 0,
        skipReason: data.skipReason ?? null,
        errorMessage: data.errorMessage ?? null,
        finishedAt: new Date(),
      },
    });
  }

  /**
   * Tổng quota đã tiêu trong ngày — chặn **trước khi** gọi API (plan 29 §3.2).
   *
   * Cộng dồn theo NGÀY chứ không theo chủ đề: quota YouTube là của cả project,
   * và nút "Quét ngay" bấm tay không giới hạn số lần.
   */
  async sumQuotaUsedOnDate(runDate: string): Promise<number> {
    const result = await this.prisma.reupRun.aggregate({
      where: { runDate },
      _sum: { quotaUsed: true },
    });
    return result._sum.quotaUsed ?? 0;
  }

  async findByRunDate(runDate: string): Promise<ReupRunWithTopic[]> {
    return this.prisma.reupRun.findMany({
      where: { runDate },
      include: { topic: { select: { id: true, name: true } } },
      orderBy: { startedAt: 'desc' },
    });
  }

  async findMany(params: {
    page: number;
    limit: number;
  }): Promise<{ data: ReupRunWithTopic[]; total: number }> {
    const [data, total] = await Promise.all([
      this.prisma.reupRun.findMany({
        include: { topic: { select: { id: true, name: true } } },
        orderBy: { startedAt: 'desc' },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.reupRun.count(),
    ]);
    return { data, total };
  }
}
