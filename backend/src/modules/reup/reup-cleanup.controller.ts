import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { SettingsService } from '../settings/settings.service';
import type { ReupCleanupSettingsResponse } from '../settings/settings.types';
import { UpdateReupCleanupSettingsDto } from './dto/update-reup-cleanup-settings.dto';
import {
  ReupCleanupService,
  type CleanupPreview,
  type CleanupRunResult,
} from './reup-cleanup.service';

@ApiTags('reup')
@ApiBearerAuth()
@Controller('reup/cleanup')
export class ReupCleanupController {
  constructor(
    private readonly cleanupService: ReupCleanupService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get('settings')
  @RequirePermission('reup:view')
  @ApiOperation({ summary: 'Đọc cấu hình dọn dẹp reup (SUPER_ADMIN)' })
  getSettings(): Promise<ReupCleanupSettingsResponse> {
    return this.settingsService.getReupCleanupSettings();
  }

  @Put('settings')
  @RequirePermission('reup:manage')
  @ApiOperation({ summary: 'Cập nhật cấu hình dọn dẹp reup (SUPER_ADMIN)' })
  updateSettings(
    @Body() dto: UpdateReupCleanupSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReupCleanupSettingsResponse> {
    return this.settingsService.updateReupCleanupSettings(dto, actor.id);
  }

  @Get('preview')
  @RequirePermission('reup:view')
  @ApiOperation({
    summary: 'Xem trước danh sách bài sẽ bị xoá file (SUPER_ADMIN)',
    description:
      'Không xoá gì — cùng điều kiện lọc với "Dọn ngay" để con số luôn khớp tuyệt đối.',
  })
  preview(): Promise<CleanupPreview> {
    return this.cleanupService.preview();
  }

  @Post('run')
  @RequirePermission('reup:manage')
  @ApiOperation({ summary: 'Chạy dọn dẹp ngay (SUPER_ADMIN)' })
  run(@CurrentUser() actor: AuthenticatedUser): Promise<CleanupRunResult> {
    return this.cleanupService.run(actor.id);
  }
}
