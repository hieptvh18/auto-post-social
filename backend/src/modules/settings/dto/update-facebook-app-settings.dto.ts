import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

/** Cấu hình Meta app dùng cho luồng "Đăng nhập bằng Facebook" (plan 15). */
export class UpdateFacebookAppSettingsDto {
  @ApiProperty({ example: '1029384756102938' })
  @IsString()
  @MinLength(1)
  appId!: string;

  @ApiPropertyOptional({
    description: 'Không gửi = giữ nguyên secret đã lưu. Gửi null = xoá secret.',
    nullable: true,
  })
  @IsOptional()
  // `null` là giá trị hợp lệ (xoá secret) nên phải bỏ qua @IsString khi null.
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MinLength(1)
  appSecret?: string | null;
}
