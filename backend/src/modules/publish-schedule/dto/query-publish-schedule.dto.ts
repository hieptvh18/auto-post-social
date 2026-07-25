import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { PublishStatus } from '../../../../generated/prisma/client';

export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class QueryPublishScheduleDto {
  @ApiPropertyOptional({
    example: '2026-07-25',
    description:
      "Ngày cần xem, 'YYYY-MM-DD' theo Asia/Ho_Chi_Minh. Bỏ trống = hôm nay",
  })
  @IsOptional()
  @Matches(DATE_REGEX, { message: "date phải có dạng 'YYYY-MM-DD'" })
  date?: string;

  @ApiPropertyOptional({ description: 'UUID page trong hệ thống' })
  @IsOptional()
  @IsUUID()
  pageId?: string;

  @ApiPropertyOptional({
    enum: PublishStatus,
    description: 'Chỉ giữ job đúng trạng thái này (mốc giờ trống sẽ bị ẩn)',
  })
  @IsOptional()
  @IsEnum(PublishStatus)
  status?: PublishStatus;
}
