import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { MediaType } from '../../../../generated/prisma/client';
import { MAX_IMAGES_PER_CONTENT_ASSET } from '../content-assets.constants';

/**
 * Một ảnh **phụ** của bài nhiều ảnh — file đã được đẩy lên Drive bằng
 * `POST /media/upload` trước đó, ở đây chỉ ghi lại tham chiếu.
 */
export class CreateContentAssetFileDto {
  @ApiProperty({ description: 'fileId trả về từ POST /media/upload' })
  @IsString()
  driveFileId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driveUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Dung lượng file (byte)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSize?: number;
}

export class CreateContentAssetDto {
  @ApiProperty({ example: '5 dấu hiệu thoái hóa khớp gối' })
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'Kiến thức' })
  @IsString()
  category!: string;

  @ApiProperty({
    description: 'Bot dùng caption này khi tự động đăng lên Facebook',
  })
  @IsString()
  caption!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hashtags?: string;

  @ApiProperty({ enum: MediaType })
  @IsEnum(MediaType)
  mediaType!: MediaType;

  @ApiProperty({ description: 'fileId trả về từ POST /media/upload' })
  @IsString()
  driveFileId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  driveUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Dung lượng file (byte)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fileSize?: number;

  @ApiPropertyOptional({
    description:
      'Người DỰNG video/ảnh — phải là account role EDITOR đang hoạt động. Không bắt buộc.',
  })
  @IsOptional()
  @IsUUID()
  editorId?: string;

  @ApiPropertyOptional({
    description:
      'Phân bổ page ngay lúc upload — bổ sung sau qua PATCH cũng được',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  assignedPageIds?: string[];

  @ApiPropertyOptional({
    description:
      'Ảnh phụ của bài nhiều ảnh, ĐÚNG thứ tự đăng (phần tử đầu = ảnh thứ 2 của bài). ' +
      `Chỉ hợp lệ khi mediaType = image; tối đa ${MAX_IMAGES_PER_CONTENT_ASSET - 1} ảnh phụ. ` +
      'Cố định lúc tạo — PATCH không sửa được danh sách này.',
    type: [CreateContentAssetFileDto],
  })
  @IsOptional()
  @IsArray()
  // Trần thật nằm ở service (đếm cả ảnh đầu); ở đây chặn sớm payload quá lớn.
  @ArrayMaxSize(MAX_IMAGES_PER_CONTENT_ASSET)
  @ValidateNested({ each: true })
  @Type(() => CreateContentAssetFileDto)
  extraFiles?: CreateContentAssetFileDto[];
}
