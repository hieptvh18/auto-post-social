import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  toDashboardHealthResponse,
  type DashboardHealthResponse,
} from './dashboard.mapper';
import { DashboardService } from './dashboard.service';
import type {
  DailyChart,
  DashboardStats,
  PostsByPage,
  TopCategories,
} from './dashboard.types';
import {
  QueryDashboardDto,
  QueryPostsByPageDto,
  QueryTopCategoriesDto,
} from './dto/query-dashboard.dto';

/**
 * `dashboard:view` có ở **cả 3 role** (docs/05 §2) — guard chỉ chặn người chưa
 * đăng nhập. Việc ai được thấy số nào do service quyết (plan 14 §3.4).
 */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
@RequirePermission('dashboard:view')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('stats')
  @ApiOperation({
    summary:
      'Thẻ số Tổng quan: tồn kho (hiện tại), sản lượng (trong kỳ), số liệu đang chạy',
  })
  getStats(
    @Query() query: QueryDashboardDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<DashboardStats> {
    return this.service.getStats(query, actor);
  }

  @Get('chart/daily')
  @ApiOperation({
    summary: 'Bài đăng thành công/thất bại theo từng ngày (giờ Việt Nam)',
  })
  getDailyChart(
    @Query() query: QueryDashboardDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<DailyChart> {
    return this.service.getDailyChart(query, actor);
  }

  @Get('posts-by-page')
  @ApiOperation({ summary: 'Bài đăng theo từng page, tách ảnh/video' })
  getPostsByPage(
    @Query() query: QueryPostsByPageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PostsByPage> {
    return this.service.getPostsByPage(query, actor);
  }

  @Get('top-categories')
  @ApiOperation({
    summary:
      'Top danh mục đăng thành công nhiều nhất, gộp trên nhiều page (mặc định 10)',
  })
  getTopCategories(
    @Query() query: QueryTopCategoriesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<TopCategories> {
    return this.service.getTopCategories(query, actor);
  }

  @Get('health')
  @ApiOperation({
    summary:
      'Khối "Cần chú ý": job hỏng/kẹt, mốc giờ bỏ lỡ, hết bài, token sắp hết hạn (ADMIN/EDITOR)',
  })
  async getHealth(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<DashboardHealthResponse> {
    return toDashboardHealthResponse(await this.service.getHealth(actor));
  }
}
