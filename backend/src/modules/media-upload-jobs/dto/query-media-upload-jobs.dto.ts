import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { MediaUploadStatus } from '../../../../generated/prisma/client';

export class QueryMediaUploadJobsDto {
  @ApiPropertyOptional({ enum: MediaUploadStatus })
  @IsOptional()
  @IsEnum(MediaUploadStatus)
  status?: MediaUploadStatus;

  @ApiPropertyOptional({
    description:
      'Mặc định `true` = chỉ job của mình. `false` chỉ có tác dụng với ADMIN/EDITOR; CONTENT luôn bị giới hạn ở bài của chính mình.',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value !== 'false' : value,
  )
  @IsBoolean()
  mine?: boolean;

  @ApiPropertyOptional({ default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 50;
}
