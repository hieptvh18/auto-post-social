import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type {
  AutoPostConfigResponse,
  AutoPostSlotResponse,
} from './auto-post-config.mapper';
import {
  AutoPostConfigsService,
  type UpdateAutoPostConfigResponse,
} from './auto-post-configs.service';
import { CreateAutoPostSlotDto } from './dto/create-auto-post-slot.dto';
import { UpdateAutoPostConfigDto } from './dto/update-auto-post-config.dto';

@ApiTags('auto-post-configs')
@ApiBearerAuth()
@Controller('auto-post-configs')
@RequirePermission('autopost:manage')
export class AutoPostConfigsController {
  constructor(private readonly service: AutoPostConfigsService) {}

  @Get()
  @ApiOperation({
    summary: 'Cấu hình đăng tự động của tất cả page (kèm mốc giờ)',
  })
  findAll(): Promise<AutoPostConfigResponse[]> {
    return this.service.findAllConfigs();
  }

  @Patch(':pageId')
  @ApiOperation({ summary: 'Bật/tắt đăng tự động cho một page' })
  setEnabled(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() dto: UpdateAutoPostConfigDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UpdateAutoPostConfigResponse> {
    return this.service.setEnabled(pageId, dto, actor);
  }

  @Post(':pageId/slots')
  @ApiOperation({ summary: 'Thêm mốc giờ đăng cho page' })
  createSlot(
    @Param('pageId', ParseUUIDPipe) pageId: string,
    @Body() dto: CreateAutoPostSlotDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AutoPostSlotResponse> {
    return this.service.createSlot(pageId, dto, actor);
  }
}
