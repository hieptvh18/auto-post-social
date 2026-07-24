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
  type PaginatedContentAssets,
} from './content-assets.service';
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

  @Patch(':id')
  @RequirePermission('content:edit')
  @ApiOperation({ summary: 'Sửa content (field mô tả — giai đoạn 1)' })
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
