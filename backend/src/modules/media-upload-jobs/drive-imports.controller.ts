import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  DriveImportsService,
  type DriveImportInspectItem,
  type DriveImportResult,
} from './drive-imports.service';
import { CreateDriveImportDto } from './dto/create-drive-import.dto';
import { InspectDriveLinksDto } from './dto/inspect-drive-links.dto';

/**
 * Nhập bài từ link Google Drive (plan 24). Không gắn `MediaUploadLimitGuard`:
 * trần 20 job của plan 23 là trần **đĩa tạm**, mà luồng này copy phía Google nên
 * không ghi byte nào xuống đĩa — nó có trần riêng theo số link mỗi request.
 */
@ApiTags('drive-imports')
@ApiBearerAuth()
@Controller('media/drive-imports')
export class DriveImportsController {
  constructor(private readonly service: DriveImportsService) {}

  @Post('inspect')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('content:create')
  @ApiOperation({
    summary:
      'Dò loại file của từng link (chỉ đọc) — UI dùng để khoá checkbox "gộp ảnh" khi lô có video',
  })
  @ApiResponse({ status: 200, description: 'Loại file + lý do hỏng từng dòng' })
  inspect(
    @Body() dto: InspectDriveLinksDto,
  ): Promise<{ items: DriveImportInspectItem[] }> {
    return this.service.inspectLinks(dto);
  }

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('content:create')
  @ApiOperation({
    summary:
      'Dán danh sách link Drive ⇒ mỗi dòng một bài (hoặc gộp ảnh thành 1 bài). Trả 202 + báo cáo dòng bị bỏ qua',
  })
  @ApiResponse({
    status: 202,
    description: 'Đã tạo job; `skipped` liệt kê dòng không nhập được',
  })
  @ApiResponse({
    status: 400,
    description: 'Không dòng nào dùng được, hoặc yêu cầu gộp ảnh bất khả thi',
  })
  create(
    @Body() dto: CreateDriveImportDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<DriveImportResult> {
    return this.service.createJobs(dto, actor);
  }
}
