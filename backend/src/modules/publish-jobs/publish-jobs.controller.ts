import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigService } from '../../config/app-config.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { dayRangeUtc } from '../../common/utils/datetime.util';
import { QueryPublishJobsDto } from './dto/query-publish-jobs.dto';
import {
  toPublishJobEventResponse,
  toPublishJobResponse,
  type PublishJobEventResponse,
  type PublishJobResponse,
} from './publish-job.mapper';
import {
  PublishJobsService,
  type RetryJobResult,
} from './publish-jobs.service';

/** Response `GET /publish-jobs` — phân trang server-side (plan 13 §3.2a). */
export interface PaginatedPublishJobsResponse {
  items: PublishJobResponse[];
  total: number;
  page: number;
  pageSize: number;
}

@ApiTags('publish-jobs')
@ApiBearerAuth()
@Controller('publish-jobs')
@RequirePermission('timeline:view')
export class PublishJobsController {
  constructor(
    private readonly service: PublishJobsService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Danh sách publish job (Bot + đăng tay) có phân trang, mới nhất trước',
  })
  async findMany(
    @Query() query: QueryPublishJobsDto,
  ): Promise<PaginatedPublishJobsResponse> {
    const range = this.resolveRange(query);
    const result = await this.service.findPaginated(
      {
        from: range?.from,
        to: range?.to,
        facebookPageId: query.pageId,
        status: query.status,
        search: query.search,
      },
      { page: query.page, pageSize: query.pageSize },
    );

    return {
      items: result.items.map(toPublishJobResponse),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  /**
   * `date` = đúng một ngày (giữ tương thích với cách gọi cũ); `from`/`to` =
   * khoảng nhiều ngày cho màn Monitor. Có `date` thì `from`/`to` bị bỏ qua.
   */
  private resolveRange(
    query: QueryPublishJobsDto,
  ): { from: Date; to: Date } | undefined {
    const tz = this.config.timezone;
    if (query.date !== undefined) return dayRangeUtc(query.date, tz);
    if (query.from === undefined || query.to === undefined) return undefined;
    return {
      from: dayRangeUtc(query.from, tz).from,
      // `to` tính cả ngày cuối ⇒ lấy mốc đầu ngày kế tiếp làm biên trên (loại trừ).
      to: dayRangeUtc(query.to, tz).to,
    };
  }

  @Get(':id/events')
  @ApiOperation({
    summary: 'Nhật ký kỹ thuật của một job: đã thử mấy lần, hỏng ở bước nào',
  })
  async findEvents(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublishJobEventResponse[]> {
    const events = await this.service.findEvents(id);
    return events.map(toPublishJobEventResponse);
  }

  /**
   * Đăng lại một job đã hỏng. Quyền `jobs:retry` (chỉ ADMIN theo docs/05 §2) —
   * hẹp hơn `timeline:view` của cả controller vì đây là hành động đăng thật.
   */
  @Post(':id/retry')
  @RequirePermission('jobs:retry')
  @ApiOperation({
    summary: 'Xếp hàng đăng lại một job đã thất bại / bị bỏ qua',
  })
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RetryJobResult> {
    return this.service.retry(id, user);
  }
}
