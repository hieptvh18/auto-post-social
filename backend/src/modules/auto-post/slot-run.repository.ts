import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SlotRunStatus,
  type SlotRun,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface ClaimSlotRunData {
  slotId: string;
  runDate: string;
  runTime: string;
}

export interface FinishSlotRunData {
  status: SlotRunStatus;
  pickedCount?: number;
  jobCreatedCount?: number;
  skipReason?: string;
  errorMessage?: string;
}

/** Nơi duy nhất viết Prisma query cho `slot_runs` (rule 01). */
@Injectable()
export class SlotRunRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Giành quyền chạy một slot trong một phút cụ thể (ADR-006).
   *
   * Claim bằng **INSERT rồi bắt unique violation**, không SELECT-rồi-INSERT:
   * hai tick song song (hoặc hai process sau khi tách worker) cùng SELECT sẽ
   * cùng thấy "chưa có" và cùng đăng — race đó chỉ DB chặn được.
   * Trả `null` nghĩa là lần chạy này đã có người khác nhận.
   */
  async claim(data: ClaimSlotRunData): Promise<SlotRun | null> {
    try {
      return await this.prisma.slotRun.create({
        data: {
          slotId: data.slotId,
          runDate: data.runDate,
          runTime: data.runTime,
          status: SlotRunStatus.CLAIMED,
        },
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

  /** Đóng sổ lần chạy: ghi kết quả để về sau truy nguyên được. */
  finish(slotRunId: string, data: FinishSlotRunData): Promise<SlotRun> {
    return this.prisma.slotRun.update({
      where: { id: slotRunId },
      data: {
        status: data.status,
        pickedCount: data.pickedCount ?? 0,
        jobCreatedCount: data.jobCreatedCount ?? 0,
        skipReason: data.skipReason ?? null,
        errorMessage: data.errorMessage ?? null,
        finishedAt: new Date(),
      },
    });
  }

  /** Nhật ký cron của một ngày (`run_date` theo giờ VN) — dùng cho màn Lịch đăng bài. */
  findByRunDate(runDate: string): Promise<SlotRun[]> {
    return this.prisma.slotRun.findMany({
      where: { runDate },
      orderBy: { startedAt: 'asc' },
    });
  }
}
