import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ReupPlatform } from '../../../../generated/prisma/client';

/**
 * Query string luôn là chuỗi. Phải đọc `obj[key]` (giá trị GỐC) chứ không dùng
 * `value`: ValidationPipe bật `enableImplicitConversion` nên `Boolean('false')`
 * đã chạy thành `true` trước khi `@Transform` được gọi — cùng cạm bẫy đã ghi ở
 * `query-content-assets.dto.ts`.
 */
function toBoolean(raw: unknown): unknown {
  if (raw === 'true' || raw === true) return true;
  if (raw === 'false' || raw === false) return false;
  return raw;
}

export class QueryReupTopicsDto {
  @ApiPropertyOptional({ enum: ReupPlatform })
  @IsOptional()
  @IsEnum(ReupPlatform)
  platform?: ReupPlatform;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ obj }): unknown =>
    toBoolean((obj as Record<string, unknown>).isActive),
  )
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Tìm theo tên chủ đề' })
  @IsOptional()
  @IsString()
  search?: string;

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
