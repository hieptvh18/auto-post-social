import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigService } from '../../config/app-config.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { dayRangeUtc } from '../../common/utils/datetime.util';
import {
  toAuditLogResponse,
  type PaginatedAuditLogsResponse,
} from './audit-log.mapper';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Controller('audit-logs')
@RequirePermission('audit:view')
export class AuditController {
  constructor(
    private readonly service: AuditService,
    private readonly config: AppConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lịch sử thao tác — ai làm gì, lúc nào (ADMIN)' })
  async findMany(
    @Query() query: QueryAuditLogsDto,
  ): Promise<PaginatedAuditLogsResponse> {
    const tz = this.config.timezone;
    const result = await this.service.findMany(
      {
        action: query.action,
        userId: query.userId,
        resource: query.resource,
        from:
          query.from === undefined
            ? undefined
            : dayRangeUtc(query.from, tz).from,
        // `to` tính cả ngày cuối ⇒ biên trên là đầu ngày kế tiếp (loại trừ).
        to: query.to === undefined ? undefined : dayRangeUtc(query.to, tz).to,
      },
      { page: query.page, pageSize: query.pageSize },
    );

    return {
      items: result.items.map(toAuditLogResponse),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  @Get('actions')
  @ApiOperation({
    summary: 'Các action đang có trong DB — UI đổ select, không hardcode',
  })
  findActions(): Promise<string[]> {
    return this.service.findActions();
  }
}
