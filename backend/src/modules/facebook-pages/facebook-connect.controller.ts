import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AppConfigService } from '../../config/app-config.service';
import { ImportPagesDto } from './dto/import-pages.dto';
import type { FacebookConnectionResponse } from './facebook-connection.mapper';
import {
  FacebookConnectService,
  type FacebookPageCandidate,
  type ImportPagesResult,
} from './facebook-connect.service';
import type { FacebookPageResponse } from './facebook-page.mapper';

/**
 * Luồng "Đăng nhập bằng Facebook" (plan 15).
 *
 * Tách khỏi `FacebookPagesController` vì callback **không** có JWT: Meta redirect
 * browser tới đây nên phải `@Public()`. Bảo vệ bằng `state` single-use trong service.
 */
@ApiTags('pages')
@ApiBearerAuth()
@Controller('pages/connect')
export class FacebookConnectController {
  constructor(
    private readonly service: FacebookConnectService,
    private readonly config: AppConfigService,
  ) {}

  @Get('url')
  @RequirePermission('pages:manage')
  @ApiOperation({
    summary: 'Lấy URL dialog đăng nhập Facebook để kết nối Page (ADMIN)',
  })
  async authUrl(
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<{ url: string }> {
    return { url: await this.service.buildAuthUrl(actor.id) };
  }

  /**
   * Meta redirect browser về đây. Luôn redirect tiếp về FE kèm kết quả —
   * không bao giờ trả JSON, vì đây là điều hướng trình duyệt chứ không phải API.
   */
  @Public()
  @Get('callback')
  @ApiExcludeEndpoint()
  async callback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<void> {
    const target = `${this.config.webBaseUrl}/pages`;

    if (error !== undefined || code === undefined || state === undefined) {
      const reason = error ?? 'missing_code';
      res.redirect(
        `${target}?fb_connect=error&reason=${encodeURIComponent(reason)}`,
      );
      return;
    }

    try {
      const connectionId = await this.service.handleCallback(code, state);
      res.redirect(`${target}?fb_connect=success&connectionId=${connectionId}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      res.redirect(
        `${target}?fb_connect=error&reason=${encodeURIComponent(reason)}`,
      );
    }
  }

  @Get()
  @RequirePermission('pages:manage')
  @ApiOperation({ summary: 'Danh sách tài khoản Facebook đã kết nối (ADMIN)' })
  listConnections(): Promise<FacebookConnectionResponse[]> {
    return this.service.listConnections();
  }

  @Get(':id/candidates')
  @RequirePermission('pages:manage')
  @ApiOperation({
    summary:
      'Page mà tài khoản đã kết nối nhìn thấy, kèm cờ đăng bài được / đã có trong hệ thống (ADMIN)',
  })
  listCandidates(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FacebookPageCandidate[]> {
    return this.service.listCandidates(id);
  }

  @Post(':id/import')
  @HttpCode(200)
  @RequirePermission('pages:manage')
  @ApiOperation({
    summary: 'Nhập page đã chọn vào hệ thống bằng Page token lấy được (ADMIN)',
  })
  importPages(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportPagesDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ImportPagesResult> {
    return this.service.importPages(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('pages:manage')
  @ApiOperation({
    summary:
      'Ngắt kết nối tài khoản Facebook — page đang chạy giữ nguyên token (ADMIN)',
  })
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.revoke(id, actor);
  }
}

/** Nút "Lấy lại token" nằm trên từng page nên gắn vào route `/pages/:id`. */
@ApiTags('pages')
@ApiBearerAuth()
@Controller('pages')
export class FacebookPageTokenController {
  constructor(private readonly service: FacebookConnectService) {}

  @Post(':id/refresh-token')
  @HttpCode(200)
  @RequirePermission('pages:manage')
  @ApiOperation({
    summary: 'Lấy lại Page token từ tài khoản Facebook đã kết nối (ADMIN)',
  })
  refresh(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<FacebookPageResponse> {
    return this.service.refreshPageToken(id, actor);
  }
}
