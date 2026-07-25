import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import {
  toQueueSummaryResponse,
  type QueueSummaryResponse,
} from './monitor.mapper';
import { MonitorService } from './monitor.service';

@ApiTags('monitor')
@ApiBearerAuth()
@Controller('monitor')
@RequirePermission('queue:view')
export class MonitorController {
  constructor(private readonly service: MonitorService) {}

  @Get('queue/summary')
  @ApiOperation({
    summary:
      'Sức khoẻ hàng đợi đăng bài: số job trong BullMQ, số job trong DB, job kẹt',
  })
  async getQueueSummary(): Promise<QueueSummaryResponse> {
    return toQueueSummaryResponse(await this.service.getQueueSummary());
  }
}
