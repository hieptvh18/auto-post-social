import { Injectable } from '@nestjs/common';
import { SlotRunStatus, type SlotRun } from '../../../generated/prisma/client';
import { SlotRunRepository } from './slot-run.repository';

/** Lý do một lần chạy không tạo job nào — hiện thẳng lên màn Lịch đăng bài. */
export const SkipReason = {
  NO_CONTENT: 'NO_CONTENT',
  PAGE_PAUSED: 'PAGE_PAUSED',
  TOKEN_MISSING: 'TOKEN_MISSING',
} as const;

export type SkipReasonValue = (typeof SkipReason)[keyof typeof SkipReason];

@Injectable()
export class SlotRunService {
  constructor(private readonly repository: SlotRunRepository) {}

  /** `null` = phút này đã có tick khác nhận rồi, lần chạy hiện tại phải im lặng rút lui. */
  claim(
    slotId: string,
    runDate: string,
    runTime: string,
  ): Promise<SlotRun | null> {
    return this.repository.claim({ slotId, runDate, runTime });
  }

  finishDone(
    slotRunId: string,
    pickedCount: number,
    jobCreatedCount: number,
  ): Promise<SlotRun> {
    return this.repository.finish(slotRunId, {
      status: SlotRunStatus.DONE,
      pickedCount,
      jobCreatedCount,
    });
  }

  finishSkipped(
    slotRunId: string,
    skipReason: SkipReasonValue,
  ): Promise<SlotRun> {
    return this.repository.finish(slotRunId, {
      status: SlotRunStatus.SKIPPED,
      skipReason,
    });
  }

  finishError(slotRunId: string, errorMessage: string): Promise<SlotRun> {
    return this.repository.finish(slotRunId, {
      status: SlotRunStatus.ERROR,
      errorMessage,
    });
  }

  findByRunDate(runDate: string): Promise<SlotRun[]> {
    return this.repository.findByRunDate(runDate);
  }
}
