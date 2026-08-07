import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { MAX_IMAGES_PER_CONTENT_ASSET } from '../content-assets/content-assets.constants';
import { CreateMediaUploadJobDto } from './dto/create-media-upload-job.dto';
import { QueryMediaUploadJobsDto } from './dto/query-media-upload-jobs.dto';
import type { MediaUploadJobResponse } from './media-upload-job.mapper';
import { MediaUploadJobsService } from './media-upload-jobs.service';
import { MediaUploadLimitGuard } from './media-upload-limit.guard';
import type { UploadedDiskFile } from './media-upload-jobs.service';

@ApiTags('media-upload-jobs')
@ApiBearerAuth()
@Controller('media/upload-jobs')
export class MediaUploadJobsController {
  constructor(private readonly service: MediaUploadJobsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('content:create')
  // Guard chạy TRƯỚC interceptor multer ⇒ quá tải thì từ chối khi chưa ghi byte
  // nào xuống đĩa (xem `media-upload-limit.guard.ts`).
  @UseGuards(MediaUploadLimitGuard)
  @UseInterceptors(FilesInterceptor('files', MAX_IMAGES_PER_CONTENT_ASSET))
  @ApiOperation({
    summary:
      'Nhận file + field form, trả 202 ngay; phần đẩy lên Drive chạy nền qua hàng đợi',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
        },
        title: { type: 'string' },
        category: { type: 'string' },
        caption: { type: 'string' },
        hashtags: { type: 'string' },
        assignedPageIds: { type: 'string', example: '["<uuid>"]' },
        editorId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 202, description: 'Đã nhận file, job vào hàng đợi' })
  @ApiResponse({ status: 503, description: 'Quá nhiều file đang chờ xử lý' })
  create(
    @Body() dto: CreateMediaUploadJobDto,
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFiles() files?: UploadedDiskFile[],
  ): Promise<MediaUploadJobResponse> {
    return this.service.createJob(files ?? [], dto, actor);
  }

  @Get()
  @RequirePermission('content:create')
  @ApiOperation({
    summary: 'Job upload của tôi (CONTENT luôn chỉ thấy job của chính mình)',
  })
  findAll(
    @Query() query: QueryMediaUploadJobsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MediaUploadJobResponse[]> {
    return this.service.findAll(query, actor);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermission('content:create')
  @UseGuards(MediaUploadLimitGuard)
  @ApiOperation({
    summary:
      'Đẩy lại job thất bại — dùng lại file tạm, không phải chọn lại file',
  })
  retry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<MediaUploadJobResponse> {
    return this.service.retry(id, actor);
  }
}
