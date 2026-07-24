import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { DriveAuthMode } from '../../../config/env.validation';

/** Chuỗi rỗng từ form ⇒ null, để phân biệt "xoá giá trị" với "không gửi". */
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class UpdateDriveSettingsDto {
  @ApiProperty({
    enum: DriveAuthMode,
    description:
      'service_account = SA JSON + Shared Drive; oauth2 = tài khoản user (Gmail free)',
  })
  @IsEnum(DriveAuthMode)
  authMode!: DriveAuthMode;

  @ApiPropertyOptional({ description: 'ID folder đích trên Google Drive' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(255)
  folderId?: string | null;

  @ApiPropertyOptional({
    description:
      'Nội dung JSON service account. KHÔNG gửi field này = giữ nguyên giá trị đã lưu.',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  serviceAccountJson?: string | null;

  @ApiPropertyOptional({
    description: 'OAuth2 Client ID (Google Cloud Console).',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(255)
  oauthClientId?: string | null;

  @ApiPropertyOptional({
    description:
      'OAuth2 Client Secret. KHÔNG gửi = giữ nguyên. Đổi client ⇒ phải kết nối lại.',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  oauthClientSecret?: string | null;

  @ApiProperty({ description: 'Giới hạn dung lượng 1 file upload (MB)' })
  @IsInt()
  @Min(1)
  @Max(2048)
  maxUploadMb!: number;
}
