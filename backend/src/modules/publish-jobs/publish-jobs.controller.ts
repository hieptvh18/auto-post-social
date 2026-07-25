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
    summary: 'Danh sách publish job (Bot + đăng tay), mới nhất trước',
  })
  async findMany(
    @Query() query: QueryPublishJobsDto,
  ): Promise<PublishJobResponse[]> {
    const range =
      query.date === undefined
        ? undefined
        : dayRangeUtc(query.date, this.config.timezone);
    const jobs = await this.service.findMany({
      from: range?.from,
      to: range?.to,
      facebookPageId: query.pageId,
      status: query.status,
    });
    return jobs.map(toPublishJobResponse);
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
