import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ReupVideoStatus } from '../../../../generated/prisma/client';

export class QueryReupVideosDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  topicId?: string;

  @ApiPropertyOptional({ enum: ReupVideoStatus })
  @IsOptional()
  @IsEnum(ReupVideoStatus)
  status?: ReupVideoStatus;

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
