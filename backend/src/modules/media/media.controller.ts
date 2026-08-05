import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MediaService, type UploadResult } from './media.service';

/** File từ multer memoryStorage — khai tường minh để không dùng any. */
interface UploadedMulterFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@ApiTags('media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @RequirePermission('content:create')
  @ApiOperation({ summary: 'Upload ảnh/video lên Google Drive' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  // memoryStorage: KHÔNG ghi file xuống disk server (plan 03 §2).
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  upload(@UploadedFile() file?: UploadedMulterFile): Promise<UploadResult> {
    if (file === undefined) {
      throw new BadRequestException('Thiếu file upload (field "file")');
    }

    return this.mediaService.upload({
      // Busboy (multer) decode header multipart bằng latin1 mặc định, trong khi
      // trình duyệt gửi tên file UTF-8 ⇒ phải decode lại để tránh lỗi font.
      filename: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      mimeType: file.mimetype,
      buffer: file.buffer,
    });
  }
}
