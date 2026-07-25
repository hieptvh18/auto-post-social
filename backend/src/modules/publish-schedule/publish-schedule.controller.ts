import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { QueryPublishScheduleDto } from './dto/query-publish-schedule.dto';
import type { PublishScheduleResponse } from './publish-schedule.mapper';
import { PublishScheduleService } from './publish-schedule.service';

@ApiTags('publish-schedule')
@ApiBearerAuth()
@Controller('publish-schedule')
@RequirePermission('timeline:view')
export class PublishScheduleController {
  constructor(private readonly service: PublishScheduleService) {}

  @Get()
  @ApiOperation({
    summary:
      'Lịch đăng bài của mọi page trong 1 ngày: mốc giờ đã cấu hình + job thực tế',
  })
  getSchedule(
    @Query() query: QueryPublishScheduleDto,
  ): Promise<PublishScheduleResponse> {
    return this.service.getSchedule(query);
  }
}
