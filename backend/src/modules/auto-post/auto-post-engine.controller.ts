import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ClockService } from '../../infra/clock/clock.service';
import {
  AutoPostSchedulerService,
  type RunSlotResult,
  type TickResult,
} from './auto-post-scheduler.service';

@ApiTags('auto-post-engine')
@ApiBearerAuth()
@Controller('auto-post')
@RequirePermission('autopost:manage')
export class AutoPostEngineController {
  constructor(
    private readonly scheduler: AutoPostSchedulerService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Chạy ngay một nhịp cron thay vì ngồi đợi tới đúng mốc giờ. Vẫn đi qua đúng
   * `slot_runs` claim nên bấm nhiều lần trong cùng một phút cũng không đăng trùng.
   */
  @Post('run-now')
  @ApiOperation({
    summary: 'Chạy ngay một nhịp cron cho các mốc giờ trùng phút hiện tại',
  })
  runNow(): Promise<TickResult> {
    return this.scheduler.tick(this.clock.now());
  }

  /**
   * Chạy lại đúng một mốc giờ ngay lập tức, kể cả khi giờ đó đã trôi qua —
   * nút "Chạy lại mốc này" ở màn Lịch đăng bài cho mốc bị Bot bỏ qua.
   */
  @Post('slots/:slotId/run-now')
  @ApiOperation({ summary: 'Chạy lại ngay một mốc giờ đã bị bỏ qua' })
  runSlotNow(
    @Param('slotId', ParseUUIDPipe) slotId: string,
  ): Promise<RunSlotResult> {
    return this.scheduler.runSlotNow(slotId);
  }
}
