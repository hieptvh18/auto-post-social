import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class QueryAuditLogsDto {
  @ApiPropertyOptional({ example: 'PAGE_TOKEN_UPDATE' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({ description: 'UUID người thực hiện' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: 'content_asset:',
    description: 'Khớp tiền tố resource',
  })
  @IsOptional()
  @IsString()
  resource?: string;

  @ApiPropertyOptional({
    example: '2026-07-01',
    description:
      "Từ ngày (tính cả ngày này), 'YYYY-MM-DD' theo Asia/Ho_Chi_Minh",
  })
  @IsOptional()
  @Matches(DATE_REGEX, { message: "from phải có dạng 'YYYY-MM-DD'" })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-07-25',
    description: "Đến ngày (tính cả ngày này), 'YYYY-MM-DD'",
  })
  @IsOptional()
  @Matches(DATE_REGEX, { message: "to phải có dạng 'YYYY-MM-DD'" })
  to?: string;

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
  pageSize = 20;
}
