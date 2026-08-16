import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class DebugSearchDto {
  @ApiProperty({ example: 'mẹo nấu ăn' })
  @IsString()
  @Length(1, 200)
  keyword!: string;

  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  max?: number;

  @ApiPropertyOptional({ default: 'VN' })
  @IsOptional()
  @IsString()
  @Length(2, 5)
  regionCode?: string;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  publishedAfterDays?: number;
}
