import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { ReupScheduleSettingsResponse } from '../settings/settings.types';
import { UpdateReupScheduleDto } from './dto/update-reup-schedule.dto';
import { ReupScheduleService } from './reup-schedule.service';

@ApiTags('reup')
@ApiBearerAuth()
@Controller('reup/settings/schedule')
export class ReupScheduleController {
  constructor(private readonly scheduleService: ReupScheduleService) {}

  @Get()
  @RequirePermission('reup:view')
  @ApiOperation({
    summary: 'Đọc lịch chạy cron reup (SUPER_ADMIN)',
    description:
      '`nextRunAt` lấy từ chính CronJob đang chạy — dùng để xác nhận giờ vừa đặt đã có hiệu lực thật.',
  })
  getSchedule(): Promise<ReupScheduleSettingsResponse> {
    return this.scheduleService.getSettings();
  }

  @Put()
  @RequirePermission('reup:manage')
  @ApiOperation({
    summary: 'Đổi lịch chạy cron reup (SUPER_ADMIN)',
    description: 'Có hiệu lực ngay, không cần khởi động lại backend.',
  })
  updateSchedule(
    @Body() dto: UpdateReupScheduleDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReupScheduleSettingsResponse> {
    return this.scheduleService.updateSettings(dto, actor.id);
  }
}
