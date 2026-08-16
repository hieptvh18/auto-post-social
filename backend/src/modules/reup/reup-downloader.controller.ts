import { Body, Controller, Get, Inject, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  REUP_DOWNLOADER,
  type DownloaderAvailability,
  type ReupDownloaderPort,
  type ReupVideoCandidate,
} from '../../infra/reup-downloader/reup-downloader.interface';
import { UpdateYoutubeApiSettingsDto } from '../settings/dto/update-youtube-api-settings.dto';
import { SettingsService } from '../settings/settings.service';
import type { YoutubeApiSettingsResponse } from '../settings/settings.types';
import { DebugDownloadDto } from './dto/debug-download.dto';
import { DebugSearchDto } from './dto/debug-search.dto';
import { ReupDebugService } from './reup-debug.service';

/**
 * Sức khoẻ cầu nối + 2 endpoint chẩn đoán + cấu hình API key YouTube.
 *
 * **Vì sao API key YouTube nằm ở đây chứ không ở `/settings`:** toàn bộ
 * `SettingsController` gác `settings:manage` — quyền mà ADMIN **có**. Đặt tab
 * "YouTube API" ở đó là để lộ sự tồn tại của tính năng reup cho ADMIN, đúng thứ
 * plan 31 (cạm bẫy C9) chặn ở màn audit. Ở đây nó gác `reup:*` nên chỉ
 * SUPER_ADMIN thấy.
 */
@ApiTags('reup')
@ApiBearerAuth()
@Controller('reup')
export class ReupDownloaderController {
  constructor(
    @Inject(REUP_DOWNLOADER)
    private readonly downloader: ReupDownloaderPort,
    private readonly settings: SettingsService,
    private readonly debugService: ReupDebugService,
  ) {}

  @Get('health')
  @RequirePermission('reup:view')
  @ApiOperation({
    summary: 'Downloader có dùng được không (SUPER_ADMIN)',
    description:
      'LUÔN trả 200, kể cả khi chưa cài downloader — "chưa cài" là câu trả lời hợp lệ, không phải sự cố. Dùng cho banner ở màn Reup.',
  })
  health(): Promise<DownloaderAvailability> {
    return this.downloader.checkAvailability();
  }

  @Get('settings/youtube')
  @RequirePermission('reup:view')
  @ApiOperation({
    summary:
      'Đọc cấu hình YouTube API (SUPER_ADMIN) — key đã mask 4 ký tự cuối',
  })
  getYoutubeSettings(): Promise<YoutubeApiSettingsResponse> {
    return this.settings.getYoutubeApiSettings();
  }

  @Put('settings/youtube')
  @RequirePermission('reup:manage')
  @ApiOperation({
    summary: 'Cập nhật API key YouTube (SUPER_ADMIN)',
    description:
      'Không gửi `apiKey` ⇒ giữ nguyên key đang lưu. Gửi `null` ⇒ xoá key.',
  })
  updateYoutubeSettings(
    @Body() dto: UpdateYoutubeApiSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<YoutubeApiSettingsResponse> {
    return this.settings.updateYoutubeApiSettings(dto, actor.id);
  }

  @Post('debug/search')
  @RequirePermission('reup:manage')
  @ApiOperation({
    summary: '[CHẨN ĐOÁN] Tìm thử video theo keyword (SUPER_ADMIN)',
    description:
      'Công cụ chẩn đoán cầu nối Python — KHÔNG ghi gì vào DB, không tải video. Mỗi lần gọi tốn 100 quota units của YouTube, đừng bấm liên tục.',
  })
  debugSearch(@Body() dto: DebugSearchDto): Promise<ReupVideoCandidate[]> {
    return this.debugService.search(dto);
  }

  @Post('debug/download')
  @RequirePermission('reup:manage')
  @ApiOperation({
    summary: '[CHẨN ĐOÁN] Tải thử 1 video về đĩa server (SUPER_ADMIN)',
    description:
      'Công cụ chẩn đoán — tải về REUP_TMP_DIR và KHÔNG tạo content_assets, KHÔNG đẩy lên Drive. File tạm phải tự dọn.',
  })
  debugDownload(
    @Body() dto: DebugDownloadDto,
  ): Promise<{ filePath: string; fileSize: number; mimeType: string }> {
    return this.debugService.download(dto);
  }
}
