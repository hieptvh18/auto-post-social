import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { SLOT_TIME_REGEX } from './create-auto-post-slot.dto';

export class UpdateAutoPostSlotDto {
  @ApiPropertyOptional({ example: '20:30' })
  @IsOptional()
  @Matches(SLOT_TIME_REGEX, {
    message: "time phải có dạng 'HH:mm' trong khoảng 00:00–23:59",
  })
  time?: string;

  @ApiPropertyOptional({ example: ['Khuyến mãi'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'Phải chọn ít nhất 1 dạng bài' })
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ enum: SlotMediaType })
  @IsOptional()
  @IsEnum(SlotMediaType)
  mediaType?: SlotMediaType;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  postCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
