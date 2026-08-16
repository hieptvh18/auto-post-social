import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReupPlatform } from '../../../../generated/prisma/client';

/**
 * Ràng buộc **giữa các field** (`minDurationSec < maxDurationSec`, keyword rỗng
 * khi platform=YOUTUBE) kiểm ở **service**, không ở DTO — rule 01 §DTO: chúng
 * cần đọc state hiện tại khi PATCH chỉ gửi một nửa cặp field.
 */
export class CreateReupTopicDto {
  @ApiProperty({ example: 'Mẹo nấu ăn' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional({
    enum: ReupPlatform,
    default: ReupPlatform.YOUTUBE,
    description:
      'Giai đoạn này CHỈ YOUTUBE chạy thật. DOUYIN/TIKTOK lưu được nhưng cron sẽ bỏ qua (SKIPPED/PLATFORM_NOT_SUPPORTED).',
  })
  @IsOptional()
  @IsEnum(ReupPlatform)
  platform?: ReupPlatform;

  @ApiPropertyOptional({ type: [String], example: ['mẹo nấu ăn', 'món ngon'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  keywords?: string[];

  @ApiPropertyOptional({ default: 'VN' })
  @IsOptional()
  @IsString()
  @Length(2, 5)
  regionCode?: string;

  @ApiProperty({
    description: 'Map sang "Dạng" bài của kho nội dung khi import',
    example: 'Ẩm thực',
  })
  @IsString()
  @Length(1, 120)
  category!: string;

  @ApiPropertyOptional({ default: 3, minimum: 1, maximum: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  dailyQuota?: number;

  @ApiPropertyOptional({ default: 50000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minViewCount?: number;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  maxAgeDays?: number;

  @ApiPropertyOptional({ default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minDurationSec?: number;

  @ApiPropertyOptional({ default: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDurationSec?: number;

  @ApiPropertyOptional({
    default: false,
    description:
      'Bật = video tải về vào thẳng hàng chờ đăng, KHÔNG qua duyệt tay (QĐ-5).',
  })
  @IsOptional()
  @IsBoolean()
  autoApprove?: boolean;

  @ApiPropertyOptional({
    description:
      'Caption mặc định. `{title}` được thay bằng tiêu đề video gốc.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  captionTemplate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  hashtags?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
