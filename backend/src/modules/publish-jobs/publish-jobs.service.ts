import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  PublishJobEventType,
  PublishStatus,
  type PublishJob,
  type PublishJobEvent,
} from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditAction, AuditService } from '../audit/audit.service';
import { PublishJobEventsService } from './publish-job-events.service';
import {
  PublishJobsRepository,
  type FindJobsFilter,
  type JobWithContext,
  type PagingParams,
} from './publish-jobs.repository';
import {
  PUBLISH_FACEBOOK_QUEUE,
  PUBLISH_MAX_ATTEMPTS,
  type PublishFacebookJobData,
} from './publish-queue.constants';

export interface CreateQueuedJobParams {
  contentAssetId: string;
  facebookPageId: string;
  caption: string;
  hashtags?: string | null;
  scheduleTime: Date;
}

/** Trạng thái mà job coi như đã dừng hẳn ⇒ được phép cho chạy lại. */
const RETRYABLE_STATUSES: readonly PublishStatus[] = [
  PublishStatus.FAILED,
  PublishStatus.CANCELLED,
  PublishStatus.SCHEDULED,
];

export interface PaginatedJobs {
  items: JobWithContext[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RetryJobResult {
  jobId: string;
  status: PublishStatus;
  message: string;
}

/** Tạo job cho Bot và đẩy vào queue. Đăng tay không đi qua đây (không có queue). */
@Injectable()
export class PublishJobsService {
  private readonly logger = new Logger(PublishJobsService.name);

  constructor(
    private readonly repository: PublishJobsRepository,
    private readonly events: PublishJobEventsService,
    private readonly auditService: AuditService,
    @InjectQueue(PUBLISH_FACEBOOK_QUEUE)
    private readonly queue: Queue<PublishFacebookJobData>,
  ) {}

  /**
   * Tạo publish job QUEUED + enqueue. Nếu enqueue hỏng (Redis chết) thì job vẫn
   * nằm trong DB ở trạng thái QUEUED kèm dấu vết lỗi — không im lặng mất bài.
   */
  async createQueuedJob(params: CreateQueuedJobParams): Promise<PublishJob> {
    const job = await this.repository.create({
      contentAssetId: params.contentAssetId,
      facebookPageId: params.facebookPageId,
      caption: params.caption,
      hashtags: params.hashtags,
      scheduleTime: params.scheduleTime,
      status: PublishStatus.QUEUED,
      createdBy: 'Bot',
    });

    const delay = Math.max(0, params.scheduleTime.getTime() - Date.now());
    // jobId cố định theo publishJobId ⇒ add hai lần cũng chỉ có một job trong Redis.
    await this.enqueue(job.id, `publish-${job.id}`, delay);
    await this.events.log({
      publishJobId: job.id,
      attemptNo: 1,
      event: PublishJobEventType.ENQUEUED,
      message: `Đã xếp hàng đăng lúc ${params.scheduleTime.toISOString()}`,
    });
    this.logger.log(
      `Đã tạo publish job=${job.id} content=${params.contentAssetId} page=${params.facebookPageId}`,
    );

    return job;
  }

  /**
   * Đăng lại một job đã hỏng (nút "Đăng lại" ở màn Lịch đăng bài). Job đã hết
   * 3 lượt thử tự động thì nằm im ở `FAILED`; đây là lối duy nhất đưa nó trở
   * lại hàng đợi khi lỗi chỉ là nhất thời (mạng, Facebook 5xx, token vừa gia hạn).
   *
   * Chỉ nhận job đã dừng hẳn — `QUEUED`/`PUBLISHING` vẫn đang trong tay worker,
   * đẩy lại sẽ đăng trùng lên page thật.
   */
  async retry(
    publishJobId: string,
    actor: AuthenticatedUser,
  ): Promise<RetryJobResult> {
    const job = await this.repository.findForExecution(publishJobId);
    if (job === null) {
      throw new NotFoundException('Không tìm thấy publish job');
    }

    if (job.status === PublishStatus.SUCCESS) {
      throw new ConflictException(
        `Bài "${job.contentAsset.title}" đã đăng thành công lên page "${job.facebookPage.pageName}" rồi`,
      );
    }
    if (!RETRYABLE_STATUSES.includes(job.status)) {
      throw new ConflictException(
        `Job đang ở trạng thái ${job.status} — đang trong hàng đợi đăng, đợi chạy xong rồi hãy thử lại`,
      );
    }

    if (job.facebookPage.deletedAt !== null) {
      throw new BadRequestException(
        `Page "${job.facebookPage.pageName}" đã bị xoá — không đăng lại được`,
      );
    }
    if (!job.facebookPage.isActive) {
      throw new BadRequestException(
        `Page "${job.facebookPage.pageName}" đang tạm dừng — bật lại ở mục Quản lý Page trước khi đăng lại`,
      );
    }

    // Rule "mỗi bài chỉ đăng 1 lần trên 1 page": job này hỏng nhưng bài có thể
    // đã lên page qua đường khác (đăng tay, job khác) ⇒ không đăng chồng lần nữa.
    const published = await this.repository.hasPublishedAssignment(
      job.contentAssetId,
      job.facebookPageId,
    );
    if (published) {
      throw new ConflictException(
        `Bài "${job.contentAsset.title}" đã được đăng lên page "${job.facebookPage.pageName}" rồi`,
      );
    }

    // Bull job cũ vẫn nằm trong Redis (`removeOnFail: false`) nên add lại cùng
    // jobId sẽ bị bỏ qua — dọn cái cũ rồi dùng jobId mới có mốc thời gian.
    if (job.bullJobId !== null) {
      try {
        await this.queue.remove(job.bullJobId);
      } catch (error) {
        this.logger.warn(
          `Không xoá được bull job cũ ${job.bullJobId}: ${describe(error)}`,
        );
      }
    }

    await this.repository.requeue(job.id);
    await this.enqueue(job.id, `publish-${job.id}-retry-${Date.now()}`, 0);
    await this.events.log({
      publishJobId: job.id,
      attemptNo: 1,
      event: PublishJobEventType.ENQUEUED,
      message: `Đăng lại thủ công bởi ${actor.name}`,
    });
    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.PUBLISH_JOB_RETRY,
      resource: `publish_job:${job.id}`,
      beforeValue: { status: job.status, errorMessage: job.errorMessage },
      afterValue: { status: PublishStatus.QUEUED },
    });
    this.logger.log(`Đăng lại job=${job.id} theo yêu cầu của ${actor.email}`);

    return {
      jobId: job.id,
      status: PublishStatus.QUEUED,
      message: `Đã xếp hàng đăng lại "${job.contentAsset.title}" lên page "${job.facebookPage.pageName}"`,
    };
  }

  /** Đẩy vào BullMQ rồi lưu lại id để còn dọn/tra cứu về sau. */
  private async enqueue(
    publishJobId: string,
    bullJobId: string,
    delay: number,
  ): Promise<void> {
    const bullJob = await this.queue.add(
      PUBLISH_FACEBOOK_QUEUE,
      { publishJobId },
      {
        delay,
        jobId: bullJobId,
        attempts: PUBLISH_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );

    if (bullJob.id !== undefined) {
      await this.repository.setBullJobId(publishJobId, bullJob.id);
    }
  }

  findMany(filter: FindJobsFilter): Promise<JobWithContext[]> {
    return this.repository.findMany(filter);
  }

  /**
   * Danh sách có phân trang cho màn Monitor / Failed Jobs — nhìn xuyên ngày nên
   * không được trả mảng trần như `/timeline` (một ngày, luôn ít bản ghi).
   */
  async findPaginated(
    filter: FindJobsFilter,
    paging: PagingParams,
  ): Promise<PaginatedJobs> {
    const [items, total] = await Promise.all([
      this.repository.findMany(filter, paging),
      this.repository.countMany(filter),
    ]);
    return { items, total, page: paging.page, pageSize: paging.pageSize };
  }

  async findEvents(publishJobId: string): Promise<PublishJobEvent[]> {
    const job = await this.repository.findById(publishJobId);
    if (job === null) {
      throw new NotFoundException('Không tìm thấy publish job');
    }
    return this.events.findByJobId(publishJobId);
  }
}

function describe(error: unknown): string {
  return error instanceof Error && error.message !== ''
    ? error.message
    : 'Lỗi không xác định';
}
