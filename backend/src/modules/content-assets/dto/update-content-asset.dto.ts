import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Giai đoạn 1: chỉ sửa field mô tả thường. Không nhận `status`/`isAds`/
 * `assignedPageIds` — client set các field đó sẽ bị `forbidNonWhitelisted` chặn
 * (giai đoạn 2 sẽ mở endpoint PATCH này rộng ra theo plan 04 §4 giai đoạn 2).
 */
export class UpdateContentAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hashtags?: string;
}
