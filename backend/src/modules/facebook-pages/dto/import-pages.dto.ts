import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

/** Nhập page từ một kết nối Facebook vào hệ thống (plan 15 §3.6). */
export class ImportPagesDto {
  @ApiProperty({
    description: 'Danh sách Facebook Page ID muốn đưa vào hệ thống',
    example: ['771029384756102'],
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  pageIds!: string[];

  @ApiPropertyOptional({
    description:
      'true = đồng ý thay token dán tay hiện có bằng token lấy từ đăng nhập. ' +
      'Mặc định false ⇒ page dán tay bị bỏ qua và trả về trong `needsConfirm`.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  overwriteManual?: boolean;
}
