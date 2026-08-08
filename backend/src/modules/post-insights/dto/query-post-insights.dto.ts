import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { MediaType } from '../../../../generated/prisma/client';
import {
  INSIGHT_SORT_FIELDS,
  type InsightSortField,
  type SortDirection,
} from '../post-insights.repository';

const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export class QueryPostInsightsDto {
  @ApiPropertyOptional({ enum: MediaType, description: 'Lọc theo loại media' })
  @IsOptional()
  @IsEnum(MediaType)
  mediaType?: MediaType;

  @ApiPropertyOptional({
    enum: INSIGHT_SORT_FIELDS,
    default: 'publishedAt',
    description: 'Cột sắp xếp. Mặc định bài mới đăng nằm trên cùng',
  })
  @IsOptional()
  @IsIn(INSIGHT_SORT_FIELDS)
  sortBy: InsightSortField = 'publishedAt';

  @ApiPropertyOptional({ enum: SORT_DIRECTIONS, default: 'desc' })
  @IsOptional()
  @IsIn(SORT_DIRECTIONS)
  sortDir: SortDirection = 'desc';

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
