import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { SlotMediaType } from '../../../../generated/prisma/client';

/** 'HH:mm' 24h — 00:00..23:59. */
export const SLOT_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateAutoPostSlotDto {
  @ApiProperty({
    example: '08:00',
    description: "Mốc giờ 'HH:mm' hiểu theo Asia/Ho_Chi_Minh (không phải UTC)",
  })
  @Matches(SLOT_TIME_REGEX, {
    message: "time phải có dạng 'HH:mm' trong khoảng 00:00–23:59",
  })
  time!: string;

  @ApiProperty({
    example: ['Cơ xương khớp'],
    description:
      'Đúng 1 danh mục. Cột vẫn là mảng (dữ liệu cũ có thể nhiều) nhưng từ nay ' +
      'mỗi mốc giờ chỉ 1 dạng bài — nhiều dạng thì khai nhiều mốc giờ, để biết ' +
      'chắc mỗi lần Bot đăng bài thuộc dạng nào.',
  })
  @IsArray()
  @ArrayNotEmpty({ message: 'Phải chọn 1 dạng bài' })
  @ArrayMaxSize(1, {
    message:
      'Mỗi mốc giờ chỉ được 1 dạng bài — muốn đăng nhiều dạng thì thêm mốc giờ khác',
  })
  @IsString({ each: true })
  categories!: string[];

  @ApiProperty({ enum: SlotMediaType, example: SlotMediaType.all })
  @IsEnum(SlotMediaType)
  mediaType!: SlotMediaType;

  @ApiProperty({
    example: 1,
    description: 'Số bài mỗi lần bắn — chặn trên bằng MAX_POST_PER_SLOT',
  })
  @IsInt()
  @Min(1)
  postCount!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
