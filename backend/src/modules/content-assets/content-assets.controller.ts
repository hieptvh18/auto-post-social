import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { ContentAssetResponse } from './content-asset.mapper';
import {
  ContentAssetsService,
  type CategorySuggestion,
  type EditorOption,
  type HashtagSuggestion,
  type PaginatedContentAssets,
} from './content-assets.service';
import type { BulkResult } from '../../common/bulk/bulk-result';
import { BulkIdsDto, BulkSetActiveDto } from './dto/bulk-content-assets.dto';
import { CreateContentAssetDto } from './dto/create-content-asset.dto';
import { QueryContentAssetsDto } from './dto/query-content-assets.dto';
import { UpdateContentAssetDto } from './dto/update-content-asset.dto';

@ApiTags('content-assets')
@ApiBearerAuth()
@Controller('content-assets')
export class ContentAssetsController {
  constructor(private readonly service: ContentAssetsService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách content (CONTENT chỉ thấy bài của mình)',
  })
  findAll(
    @Query() query: QueryContentAssetsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<PaginatedContentAssets> {
    return this.service.findAll(query, actor);
  }

  // Khai báo TRƯỚC `:id` — nếu không `ParseUUIDPipe` của route dưới sẽ nuốt mất.
  @Get('hashtags')
  @ApiOperation({
    summary: 'Hashtag đã dùng trong kho — gợi ý cho ô nhập nhanh trên UI',
  })
  findHashtags(): Promise<HashtagSuggestion[]> {
    return this.service.findHashtagSuggestions();
  }

  @Get('categories')
  @ApiOperation({
    summary:
      'Danh mục ("Dạng") đang dùng — gợi ý cho ô chọn/thêm nhanh trên UI',
  })
  findCategories(): Promise<CategorySuggestion[]> {
    return this.service.findCategorySuggestions();
  }

  @Get('editors')
  @ApiOperation({
    summary:
      'Account chọn được vào ô "Editor" (người dựng video/ảnh) — role EDITOR đang hoạt động',
  })
  findEditors(): Promise<EditorOption[]> {
    return this.service.findEditorOptions();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết content' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ContentAssetResponse> {
    return this.service.findOne(id, actor);
  }

  @Post()
  @RequirePermission('content:create')
  @ApiOperation({
    summary: 'Tạo content từ file đã upload Drive (POST /media/upload)',
  })
  create(
    @Body() dto: CreateContentAssetDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ContentAssetResponse> {
    return this.service.create(dto, actor);
  }

  // Thao tác hàng loạt (plan 19). Đặt trước `:id` cho khỏi bị ParseUUIDPipe nuốt.
  // Dùng POST chứ không DELETE vì cần body danh sách id.
  @Post('bulk-delete')
  @HttpCode(200)
  @RequirePermission('content:delete')
  @ApiOperation({
    summary:
      'Xoá nhiều bài — bài nào vướng (đã đăng / không phải bài của mình) thì bỏ qua kèm lý do',
  })
  bulkDelete(
    @Body() dto: BulkIdsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BulkResult> {
    return this.service.bulkDelete(dto.ids, actor);
  }

  @Post('bulk-active')
  @HttpCode(200)
  @RequirePermission('content:edit')
  @ApiOperation({
    summary: 'Ngưng dùng / dùng lại nhiều bài (Bot chỉ lấy bài đang dùng)',
  })
  bulkSetActive(
    @Body() dto: BulkSetActiveDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<BulkResult> {
    return this.service.bulkSetActive(dto.ids, dto.isActive, actor);
  }

  @Patch(':id')
  @RequirePermission('content:edit')
  @ApiOperation({
    summary:
      'Sửa content — kèm duyệt/ADS/phân bổ page (quyền field-level ở service)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContentAssetDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ContentAssetResponse> {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('content:delete')
  @ApiOperation({ summary: 'Xoá content (kèm xoá file trên Drive)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.remove(id, actor);
  }
}
