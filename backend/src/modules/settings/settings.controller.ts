import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  MediaService,
  type DriveConnectionResult,
} from '../media/media.service';
import { DriveOAuthService } from './drive-oauth.service';
import { UpdateDriveSettingsDto } from './dto/update-drive-settings.dto';
import { UpdateFacebookAppSettingsDto } from './dto/update-facebook-app-settings.dto';
import { SettingsService } from './settings.service';
import type {
  DriveSettingsResponse,
  FacebookAppSettingsResponse,
} from './settings.types';

@ApiTags('settings')
@ApiBearerAuth()
@RequirePermission('settings:manage')
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly mediaService: MediaService,
    private readonly driveOAuthService: DriveOAuthService,
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

  @Get('facebook-app')
  @ApiOperation({
    summary:
      'Đọc cấu hình Meta app cho đăng nhập Facebook (ADMIN) — kèm redirect URI phải khai ở Meta',
  })
  getFacebookApp(): Promise<FacebookAppSettingsResponse> {
    return this.settingsService.getFacebookAppSettings();
  }

  @Put('facebook-app')
  @ApiOperation({
    summary: 'Cập nhật App ID / App Secret của Meta app (ADMIN)',
  })
  updateFacebookApp(
    @Body() dto: UpdateFacebookAppSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<FacebookAppSettingsResponse> {
    return this.settingsService.updateFacebookAppSettings(dto, actor.id);
  }

  @Get('google-drive/oauth/url')
  @ApiOperation({
    summary: 'Lấy URL consent Google để kết nối Drive bằng OAuth2 (ADMIN)',
  })
  async oauthUrl(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ url: string }> {
    return { url: await this.driveOAuthService.buildAuthUrl(actor.id) };
  }
}
