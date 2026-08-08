import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { QueryPostInsightsDto } from './dto/query-post-insights.dto';
import type { PageInsightsSummaryResponse } from './post-insights.mapper';
import {
  PostInsightsService,
  type PostInsightsListResponse,
  type SyncNowResponse,
} from './post-insights.service';

/**
 * Dùng lại quyền `pages:manage` — ai quản lý page thì xem được thống kê page đó.
 * Không thêm permission mới để khỏi phải sửa ma trận `docs/05-rbac.md` cho một
 * màn chỉ-đọc.
 */
@ApiTags('post-insights')
@ApiBearerAuth()
@Controller('pages/:pageId/insights')
@RequirePermission('pages:manage')
export class PostInsightsController {
  constructor(private readonly service: PostInsightsService) {}

  @Get('posts')
  @ApiOperation({
    summary:
      'Bài DO TOOL ĐĂNG lên page này kèm lượt hiển thị. Mặc định mới nhất trước',
  })
  findPosts(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Query() query: QueryPostInsightsDto,
  ): Promise<PostInsightsListResponse> {
    return this.service.findPosts(pageId, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Tổng số bài / lượt hiển thị / người tiếp cận' })
  getSummary(
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<PageInsightsSummaryResponse> {
    return this.service.getSummary(pageId);
  }

  @Post('sync')
  @ApiOperation({
    summary: 'Đồng bộ số liệu ngay. Throttle 5 phút/page ⇒ gọi sớm hơn trả 429',
  })
  syncNow(
    @Param('pageId', ParseUUIDPipe) pageId: string,
  ): Promise<SyncNowResponse> {
    return this.service.syncNow(pageId);
  }
}
