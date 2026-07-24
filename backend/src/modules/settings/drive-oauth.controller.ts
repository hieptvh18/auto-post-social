import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { Public } from '../../common/decorators/public.decorator';
import { DriveOAuthService } from './drive-oauth.service';

/**
 * Callback OAuth Google — Google redirect browser tới đây KHÔNG kèm JWT nên phải
 * @Public(). Bảo vệ bằng `state` single-use trong DriveOAuthService.
 * Tách riêng controller (không dính @RequirePermission ở SettingsController).
 */
@ApiExcludeController()
@Controller('settings/google-drive/oauth')
export class DriveOAuthController {
  constructor(
    private readonly driveOAuthService: DriveOAuthService,
    private readonly config: AppConfigService,
  ) {}

  @Public()
  @Get('callback')
  async callback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    const target = `${this.config.webBaseUrl}/settings`;

    if (error !== undefined || code === undefined || state === undefined) {
      const reason = error ?? 'missing_code';
      res.redirect(
        `${target}?drive_oauth=error&reason=${encodeURIComponent(reason)}`,
      );
      return;
    }

    try {
      await this.driveOAuthService.handleCallback(code, state);
      res.redirect(`${target}?drive_oauth=success`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      res.redirect(
        `${target}?drive_oauth=error&reason=${encodeURIComponent(reason)}`,
      );
    }
  }
}
