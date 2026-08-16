import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateYoutubeApiSettingsDto {
  @ApiPropertyOptional({
    description:
      'API key YouTube Data API v3. Không gửi field ⇒ GIỮ NGUYÊN key đang lưu (UI không đổ key cũ xuống client). Gửi `null` ⇒ xoá key.',
    nullable: true,
  })
  @IsOptional()
  // Cho phép `null` tường minh để xoá key; chỉ validate chuỗi khi khác null.
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(255)
  apiKey?: string | null;

  @ApiPropertyOptional({
    default: 10000,
    description:
      'Trần quota mỗi ngày. `search.list` tốn 100 units/lần nên 10.000 ≈ 100 lượt quét/ngày.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(1_000_000)
  dailyQuota?: number;
}
