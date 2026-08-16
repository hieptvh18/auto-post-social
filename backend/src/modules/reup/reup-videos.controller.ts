import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { QueryReupRunsDto } from './dto/query-reup-runs.dto';
import { QueryReupVideosDto } from './dto/query-reup-videos.dto';
import { ReupCleanupService } from './reup-cleanup.service';
import {
  ReupDiscoveryService,
  type ReupDiscoveryResult,
} from './reup-discovery.service';
import { toReupRunResponse, type ReupRunResponse } from './reup-run.mapper';
import { ReupRunsRepository } from './reup-runs.repository';
import { ReupTopicsRepository } from './reup-topics.repository';
import type { ReupVideoResponse } from './reup-video.mapper';
import {
  ReupVideosService,
  type PaginatedReupVideos,
} from './reup-videos.service';

export interface PaginatedReupRuns {
  data: ReupRunResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@ApiTags('reup')
@ApiBearerAuth()
@Controller('reup')
export class ReupVideosController {
  constructor(
    private readonly videosService: ReupVideosService,
    private readonly discovery: ReupDiscoveryService,
    private readonly topics: ReupTopicsRepository,
    private readonly runs: ReupRunsRepository,
    private readonly cleanupService: ReupCleanupService,
  ) {}

  @Get('videos')
  @RequirePermission('reup:view')
  @ApiOperation({ summary: 'Danh sách video đã kéo về (SUPER_ADMIN)' })
  findVideos(@Query() query: QueryReupVideosDto): Promise<PaginatedReupVideos> {
    return this.videosService.findAll(query);
  }

  @Post('topics/:id/discover-now')
  @RequirePermission('reup:manage')
  @ApiOperation({
    summary: 'Quét ngay một chủ đề (SUPER_ADMIN)',
    description:
      'Vẫn đi qua cùng cơ chế claim của cron ⇒ bấm 2 lần trong cùng một ngày chỉ tạo ĐÚNG 1 lượt quét, không tải thêm video.',
  })
  async discoverNow(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReupDiscoveryResult> {
    const topic = await this.topics.findById(id);
    if (topic === null) {
      throw new NotFoundException('Không tìm thấy chủ đề reup');
    }
    return this.discovery.discoverTopic(topic, actor.id);
  }

  @Post('videos/:id/retry')
  @RequirePermission('reup:manage')
  @ApiOperation({ summary: 'Thử lại video hỏng (SUPER_ADMIN)' })
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReupVideoResponse> {
    return this.videosService.retry(id, actor);
  }

  @Delete('videos/:id/resource')
  @RequirePermission('reup:manage')
  @ApiOperation({
    summary: 'Xoá file Drive của MỘT video reup đã đăng (SUPER_ADMIN)',
    description:
      'Giữ nguyên bản ghi content_assets/publish_jobs/insight (plan 30). 422 nếu bài chưa PUBLISHED, đã xoá rồi, hoặc còn job đăng chưa kết thúc ở page khác.',
  })
  deleteResource(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.cleanupService.deleteOne(id, actor.id);
  }

  @Delete('videos/:id')
  @RequirePermission('reup:manage')
  @ApiOperation({
    summary: 'Bỏ qua một video (SUPER_ADMIN)',
    description:
      'Đánh dấu SKIPPED chứ KHÔNG xoá bản ghi — giữ externalId để lượt quét sau không dò lại đúng video này.',
  })
  skip(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReupVideoResponse> {
    return this.videosService.skip(id, actor);
  }

  @Get('runs')
  @RequirePermission('reup:view')
  @ApiOperation({ summary: 'Nhật ký các lượt quét (SUPER_ADMIN)' })
  async findRuns(@Query() query: QueryReupRunsDto): Promise<PaginatedReupRuns> {
    const { data, total } = await this.runs.findMany({
      page: query.page,
      limit: query.limit,
    });

    return {
      data: data.map(toReupRunResponse),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }
}
