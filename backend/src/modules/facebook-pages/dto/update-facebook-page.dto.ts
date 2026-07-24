import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

/** `pageId` không sửa được sau khi tạo — đây là định danh phía Meta. */
export class UpdateFacebookPageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pageName?: string;

  @ApiPropertyOptional({
    description: 'Chỉ gửi khi cần thay token mới — để trống nếu không đổi',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  accessToken?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  tokenExpireAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autopostEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Dùng để kích hoạt lại page đã soft-delete',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
