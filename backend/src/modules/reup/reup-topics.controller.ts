import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CreateReupTopicDto } from './dto/create-reup-topic.dto';
import { QueryReupTopicsDto } from './dto/query-reup-topics.dto';
import { UpdateReupTopicDto } from './dto/update-reup-topic.dto';
import type { ReupTopicResponse } from './reup-topic.mapper';
import {
  ReupTopicsService,
  type PaginatedReupTopics,
} from './reup-topics.service';

@ApiTags('reup')
@ApiBearerAuth()
@Controller('reup/topics')
export class ReupTopicsController {
  constructor(private readonly service: ReupTopicsService) {}

  @Get()
  @RequirePermission('reup:view')
  @ApiOperation({ summary: 'Danh sách chủ đề reup (SUPER_ADMIN)' })
  findAll(@Query() query: QueryReupTopicsDto): Promise<PaginatedReupTopics> {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermission('reup:view')
  @ApiOperation({ summary: 'Chi tiết chủ đề reup (SUPER_ADMIN)' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ReupTopicResponse> {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermission('reup:manage')
  @ApiOperation({
    summary: 'Tạo chủ đề reup (SUPER_ADMIN)',
    description:
      '409 nếu trùng (tên, nền tảng). Nền tảng khác YOUTUBE vẫn lưu được nhưng cron sẽ bỏ qua.',
  })
  create(
    @Body() dto: CreateReupTopicDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReupTopicResponse> {
    return this.service.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission('reup:manage')
  @ApiOperation({
    summary: 'Sửa chủ đề reup — bật/tắt, đổi bộ lọc (SUPER_ADMIN)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReupTopicDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<ReupTopicResponse> {
    return this.service.update(id, dto, actor);
  }

  @Delete(':id')
  @RequirePermission('reup:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Tắt chủ đề reup (SUPER_ADMIN)',
    description:
      'SOFT DELETE — chỉ đặt isActive=false. Giữ nguyên bản ghi và toàn bộ reup_videos đã kéo (external_id còn dùng để chống tải trùng).',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.service.remove(id, actor);
  }
}
