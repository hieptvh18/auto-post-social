import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ContentStatus, MediaType } from '../../../../generated/prisma/client';

/** Bộ lọc "Phân bổ page": bài đã gán ít nhất 1 page hay chưa gán page nào. */
export const ASSIGNMENT_FILTERS = ['assigned', 'unassigned'] as const;
export type AssignmentFilter = (typeof ASSIGNMENT_FILTERS)[number];

/**
 * Query string luôn là chuỗi — đổi 'true'/'false' về boolean cho `@IsBoolean`.
 *
 * **Phải đọc từ `obj[key]` (giá trị gốc), không dùng `value`:** ValidationPipe bật
 * `enableImplicitConversion` nên class-transformer đã chạy `Boolean('false')` →
 * `true` **trước khi** `@Transform` được gọi. Dùng `value` thì mọi bộ lọc boolean
 * đều thành `true` (lỗi này từng làm `?isAds=false` không lọc được — bắt được lúc
 * smoke plan 19).
 */
function toBoolean(raw: unknown): unknown {
  if (raw === 'true' || raw === true) return true;
  if (raw === 'false' || raw === false) return false;
  return raw;
}

export class QueryContentAssetsDto {
  @ApiPropertyOptional({ enum: MediaType })
  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;

  @ApiPropertyOptional({
    enum: ASSIGNMENT_FILTERS,
    description: 'Lọc theo phân bổ page: chưa phân bổ / đã phân bổ',
  })
  @IsOptional()
  @IsIn(ASSIGNMENT_FILTERS)
  assignment?: AssignmentFilter;

  @ApiPropertyOptional({ enum: ContentStatus })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional({ description: 'Lọc bài đã tick Đạt ADS' })
  @IsOptional()
  @Transform(({ obj }): unknown =>
    toBoolean((obj as Record<string, unknown>).isAds),
  )
  @IsBoolean()
  isAds?: boolean;

  @ApiPropertyOptional({
    description:
      'Lọc theo trạng thái dùng. Bỏ trống ⇒ lấy cả bài đã ngưng dùng (màn quản kho hiện hết)',
  })
  @IsOptional()
  @Transform(({ obj }): unknown =>
    toBoolean((obj as Record<string, unknown>).isActive),
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Tìm theo tiêu đề' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo người upload — chỉ EDITOR/ADMIN dùng được',
  })
  @IsOptional()
  @IsUUID()
  createdBy?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo người dựng video/ảnh (account role EDITOR)',
  })
  @IsOptional()
  @IsUUID()
  editorId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
