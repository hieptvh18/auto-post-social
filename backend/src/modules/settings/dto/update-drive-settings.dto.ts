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
import { DriverMode } from '../../../config/env.validation';

/** Chuỗi rỗng từ form ⇒ null, để phân biệt "xoá giá trị" với "không gửi". */
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class UpdateDriveSettingsDto {
  @ApiProperty({
    enum: DriverMode,
    description: 'real = gọi Drive thật, fake = ghi thư mục tạm local',
  })
  @IsEnum(DriverMode)
  driver!: DriverMode;

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

  @ApiProperty({ description: 'Giới hạn dung lượng 1 file upload (MB)' })
  @IsInt()
  @Min(1)
  @Max(2048)
  maxUploadMb!: number;
}
