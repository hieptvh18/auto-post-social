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

/** Query string luôn là chuỗi — đổi 'true'/'false' về boolean cho `@IsBoolean`. */
function toBoolean(value: unknown): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
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
  @Transform(({ value }): unknown => toBoolean(value))
  @IsBoolean()
  isAds?: boolean;

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
