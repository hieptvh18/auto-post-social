import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  MediaService,
  type DriveConnectionResult,
} from '../media/media.service';
import { UpdateDriveSettingsDto } from './dto/update-drive-settings.dto';
import { SettingsService } from './settings.service';
import type { DriveSettingsResponse } from './settings.types';

@ApiTags('settings')
@ApiBearerAuth()
@RequirePermission('settings:manage')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly mediaService: MediaService,
  ) {}

  @Get('google-drive')
  @ApiOperation({
    summary: 'Đọc cấu hình Google Drive (ADMIN) — service account đã mask',
  })
  getDrive(): Promise<DriveSettingsResponse> {
    return this.settingsService.getDriveSettings();
  }

  @Put('google-drive')
  @ApiOperation({ summary: 'Cập nhật cấu hình Google Drive (ADMIN)' })
  updateDrive(
    @Body() dto: UpdateDriveSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<DriveSettingsResponse> {
    return this.settingsService.updateDriveSettings(dto, actor.id);
  }

  @Post('google-drive/test')
  @ApiOperation({
    summary: 'Test kết nối Drive bằng cấu hình đang lưu (ADMIN)',
  })
  testDrive(): Promise<DriveConnectionResult> {
    return this.mediaService.testConnection();
  }
}
