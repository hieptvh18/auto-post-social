import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PublishStatus } from '../../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import { ClockService } from '../../infra/clock/clock.service';
import {
  PublishJobsRepository,
  type JobWithContext,
  type StatusCounts,
} from '../publish-jobs/publish-jobs.repository';
import {
  PUBLISH_FACEBOOK_QUEUE,
  type PublishFacebookJobData,
} from '../publish-jobs/publish-queue.constants';

/** Số job đang chờ/đang chạy hiển thị ở bảng — đủ để thấy bất thường, không phải để duyệt hết. */
const ACTIVE_JOBS_LIMIT = 50;

/** Redis chết thì `getJobCounts()` treo theo timeout mặc định của ioredis — cắt sớm. */
const QUEUE_TIMEOUT_MS = 2_000;

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

export interface StuckJob {
  id: string;
  contentTitle: string;
  pageName: string;
  status: PublishStatus;
  stuckMinutes: number;
  updatedAt: Date;
}

export interface QueueSummary {
  /** `null` = không đọc được Redis; UI vẫn hiển thị phần `db`. */
  queue: QueueCounts | null;
  queueHealthy: boolean;
  queueError: string | null;
  db: StatusCounts;
  stuck: StuckJob[];
  stuckThresholdMinutes: number;
  activeJobs: JobWithContext[];
  checkedAt: Date;
}

/**
 * Màn giám sát — **chỉ đọc**. Không pause/resume/drain queue, không tự sửa job
 * kẹt (ngoài phạm vi plan 13 §2): sửa nhầm ở đây là đăng trùng lên page thật.
 */
@Injectable()
export class MonitorService {
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    private readonly jobs: PublishJobsRepository,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
    @InjectQueue(PUBLISH_FACEBOOK_QUEUE)
    private readonly queue: Queue<PublishFacebookJobData>,
  ) {}

  async getQueueSummary(): Promise<QueueSummary> {
    const now = this.clock.now();
    const thresholdMinutes = this.config.monitor.stuckMinutes;
    const stuckBefore = new Date(now.getTime() - thresholdMinutes * 60_000);

    const [queue, db, stuckJobs, activeJobs] = await Promise.all([
      this.readQueueCounts(),
      this.jobs.countByStatus(),
      this.jobs.findStuckPublishing(stuckBefore),
      this.jobs.findActive(ACTIVE_JOBS_LIMIT),
    ]);

    return {
      queue: queue.counts,
      queueHealthy: queue.counts !== null,
      queueError: queue.error,
      db,
      stuck: stuckJobs.map((job) => toStuckJob(job, now)),
      stuckThresholdMinutes: thresholdMinutes,
      activeJobs,
      checkedAt: now,
    };
  }

  /**
   * Đọc số liệu BullMQ. Redis hỏng ⇒ trả `null` + lý do chứ **không** ném lỗi:
   * màn hình giám sát mà sập theo đúng thứ nó đang giám sát thì vô nghĩa
   * (plan 13 §3.2b).
   */
  private async readQueueCounts(): Promise<{
    counts: QueueCounts | null;
    error: string | null;
  }> {
    try {
      const counts = await withTimeout(
        this.queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'failed',
          'completed',
        ),
        QUEUE_TIMEOUT_MS,
      );
      return {
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          delayed: counts.delayed ?? 0,
          failed: counts.failed ?? 0,
          completed: counts.completed ?? 0,
        },
        error: null,
      };
    } catch (error) {
      const reason =
        error instanceof Error && error.message !== ''
          ? error.message
          : 'không rõ';
      this.logger.warn(`Không đọc được số liệu queue từ Redis: ${reason}`);
      return { counts: null, error: reason };
    }
  }
}

function toStuckJob(job: JobWithContext, now: Date): StuckJob {
  return {
    id: job.id,
    contentTitle: job.contentAsset.title,
    pageName: job.facebookPage.pageName,
    status: job.status,
    stuckMinutes: Math.floor(
      (now.getTime() - job.updatedAt.getTime()) / 60_000,
    ),
    updatedAt: job.updatedAt,
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Quá ${ms}ms không phản hồi`)),
        ms,
      ).unref(),
    ),
  ]);
}
