import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
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

  @ApiProperty({ example: ['Cơ xương khớp', 'Thăm khám'] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Phải chọn ít nhất 1 dạng bài' })
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
