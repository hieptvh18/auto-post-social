import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { AutoPostSlotResponse } from './auto-post-config.mapper';
import { AutoPostConfigsService } from './auto-post-configs.service';
import { UpdateAutoPostSlotDto } from './dto/update-auto-post-slot.dto';

/** Route thao tác trực tiếp trên slot — tách khỏi `/auto-post-configs` theo docs/04 §6. */
@ApiTags('auto-post-configs')
@ApiBearerAuth()
@Controller('auto-post-slots')
@RequirePermission('autopost:manage')
export class AutoPostSlotsController {
  constructor(private readonly service: AutoPostConfigsService) {}

  @Patch(':slotId')
  @ApiOperation({ summary: 'Sửa mốc giờ / bật tắt slot' })
  update(
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @Body() dto: UpdateAutoPostSlotDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AutoPostSlotResponse> {
    return this.service.updateSlot(slotId, dto, actor);
  }

  @Delete(':slotId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Xoá mốc giờ' })
  remove(
    @Param('slotId', ParseUUIDPipe) slotId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.removeSlot(slotId, actor);
  }
}
