import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreateFacebookPageDto } from './dto/create-facebook-page.dto';
import { TestFacebookConnectionDto } from './dto/test-connection.dto';
import { UpdateFacebookPageDto } from './dto/update-facebook-page.dto';
import type { FacebookPageResponse } from './facebook-page.mapper';
import {
  FacebookPagesService,
  type FacebookConnectionResult,
} from './facebook-pages.service';

@ApiTags('pages')
@ApiBearerAuth()
@Controller('pages')
export class FacebookPagesController {
  constructor(private readonly service: FacebookPagesService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách Facebook Page (mọi role, token dạng mask)',
  })
  findAll(): Promise<FacebookPageResponse[]> {
    return this.service.findAll();
  }

  @Post()
  @RequirePermission('pages:manage')
  @ApiOperation({ summary: 'Thêm Facebook Page mới (ADMIN)' })
  create(
    @Body() dto: CreateFacebookPageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<FacebookPageResponse> {
    return this.service.create(dto, actor);
  }

  @Post('test-connection')
  @HttpCode(200)
  @RequirePermission('pages:manage')
  @ApiOperation({
    summary:
      'Test cấu hình chưa lưu: gọi thử Graph API bằng pageId + token vừa nhập (ADMIN)',
  })
  testConnection(
    @Body() dto: TestFacebookConnectionDto,
  ): Promise<FacebookConnectionResult> {
    return this.service.testConnection(dto.pageId, dto.accessToken);
  }

  @Post(':id/test-connection')
  @HttpCode(200)
  @RequirePermission('pages:manage')
  @ApiOperation({
    summary: 'Test page đã lưu bằng token trong DB (ADMIN)',
  })
  testSavedConnection(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FacebookConnectionResult> {
    return this.service.testSavedPageConnection(id);
  }

  @Put(':id')
  @RequirePermission('pages:manage')
  @ApiOperation({ summary: 'Sửa Facebook Page / đổi token (ADMIN)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFacebookPageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<FacebookPageResponse> {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('pages:manage')
  @ApiOperation({ summary: 'Xoá Facebook Page — soft delete (ADMIN)' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.remove(id, actor);
  }
}
