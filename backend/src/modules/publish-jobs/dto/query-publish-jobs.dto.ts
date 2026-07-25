import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { PublishStatus } from '../../../../generated/prisma/client';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class QueryPublishJobsDto {
  @ApiPropertyOptional({
    example: '2026-07-25',
    description:
      "Ngày tạo job, 'YYYY-MM-DD' theo Asia/Ho_Chi_Minh. Bỏ trống = mọi ngày",
  })
  @IsOptional()
  @Matches(DATE_REGEX, { message: "date phải có dạng 'YYYY-MM-DD'" })
  date?: string;

  @ApiPropertyOptional({ description: 'UUID page trong hệ thống' })
  @IsOptional()
  @IsUUID()
  pageId?: string;

  @ApiPropertyOptional({ enum: PublishStatus })
  @IsOptional()
  @IsEnum(PublishStatus)
  status?: PublishStatus;
}
