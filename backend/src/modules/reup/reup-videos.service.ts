import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { ReupVideoStatus } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AuditAction, AuditService } from '../audit/audit.service';
import {
  toReupVideoResponse,
  type ReupVideoResponse,
} from './reup-video.mapper';
import { ReupVideosRepository } from './reup-videos.repository';
import {
  buildReupJobOptions,
  REUP_DOWNLOAD_QUEUE,
  type ReupDownloadJobData,
} from './reup.constants';
import type { QueryReupVideosDto } from './dto/query-reup-videos.dto';

export interface PaginatedReupVideos {
  data: ReupVideoResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class ReupVideosService {
  constructor(
    private readonly repository: ReupVideosRepository,
    private readonly auditService: AuditService,
    @InjectQueue(REUP_DOWNLOAD_QUEUE)
    private readonly queue: Queue<ReupDownloadJobData>,
  ) {}

  async findAll(query: QueryReupVideosDto): Promise<PaginatedReupVideos> {
    const { data, total } = await this.repository.findMany({
      topicId: query.topicId,
      status: query.status,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: data.map(toReupVideoResponse),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /**
   * Thử lại một video hỏng. Chỉ nhận `FAILED` — video đang chạy mà đẩy lại là
   * tạo 2 luồng tải cùng lúc trên cùng một thư mục.
   */
  async retry(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ReupVideoResponse> {
    const video = await this.getOrFail(id);

    if (video.status !== ReupVideoStatus.FAILED) {
      throw new UnprocessableEntityException(
        'Chỉ thử lại được video đang ở trạng thái thất bại',
      );
    }

    const updated = await this.repository.update(id, {
      status: ReupVideoStatus.PENDING,
      errorMessage: null,
    });

    // Bull bỏ qua LẶNG LẼ khi add trùng jobId đã có trong Redis ⇒ phải xoá bản
    // cũ rồi dùng jobId mới (cùng cạm bẫy plan 07 và plan 23 đã gặp).
    const staleJobId = `reup-download-${id}`;
    await this.queue.remove(staleJobId).catch(() => undefined);
    const freshJobId = `reup-download-${id}-${Date.now()}`;
    await this.queue.add(
      REUP_DOWNLOAD_QUEUE,
      { reupVideoId: id },
      buildReupJobOptions(freshJobId),
    );

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.REUP_VIDEO_RETRY,
      resource: `reup_video:${id}`,
      afterValue: { title: video.title, sourceUrl: video.sourceUrl },
    });

    return toReupVideoResponse({
      ...updated,
      topic: video.topic,
      contentAsset: video.contentAsset,
    });
  }

  /**
   * Bỏ qua một video. **Giữ nguyên bản ghi** (và do đó giữ `external_id`) để
   * lượt quét sau không dò lại đúng video này — đó là toàn bộ lý do không xoá cứng.
   */
  async skip(id: string, actor: AuthenticatedUser): Promise<ReupVideoResponse> {
    const video = await this.getOrFail(id);

    if (video.status === ReupVideoStatus.IMPORTED) {
      throw new UnprocessableEntityException(
        'Video đã vào kho — hãy xoá bài ở màn Quản lý Ảnh/Video nếu không dùng nữa',
      );
    }

    const updated = await this.repository.update(id, {
      status: ReupVideoStatus.SKIPPED,
      errorMessage: null,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.REUP_VIDEO_SKIP,
      resource: `reup_video:${id}`,
      afterValue: { title: video.title, sourceUrl: video.sourceUrl },
    });

    return toReupVideoResponse({
      ...updated,
      topic: video.topic,
      contentAsset: video.contentAsset,
    });
  }

  private async getOrFail(id: string) {
    const video = await this.repository.findById(id);
    if (video === null) {
      throw new NotFoundException('Không tìm thấy video reup');
    }
    return video;
  }
}
