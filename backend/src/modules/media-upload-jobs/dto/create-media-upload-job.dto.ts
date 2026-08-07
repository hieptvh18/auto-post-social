import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Field form đi kèm file trong multipart. Multipart **không có kiểu** — mọi giá
 * trị tới đây đều là chuỗi, nên `assignedPageIds` phải chấp nhận cả dạng gửi
 * nhiều lần cùng tên lẫn dạng một chuỗi JSON.
 */
export class CreateMediaUploadJobDto {
  @ApiProperty({ example: '5 dấu hiệu thoái hóa khớp gối' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 'Kiến thức' })
  @IsString()
  category!: string;

  @ApiProperty({ description: 'Bot dùng caption này khi đăng lên Facebook' })
  @IsString()
  caption!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hashtags?: string;

  @ApiPropertyOptional({
    description:
      'Page gán ngay lúc upload. Gửi lặp field hoặc gửi 1 chuỗi JSON mảng.',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => parsePageIds(value))
  @IsArray()
  @IsUUID(undefined, { each: true })
  assignedPageIds?: string[];

  @ApiPropertyOptional({ description: 'Người DỰNG video/ảnh (role EDITOR)' })
  @IsOptional()
  @IsUUID()
  editorId?: string;
}

/** `'["a","b"]'` | `'a'` | `['a','b']` -> `string[]`; rỗng -> `[]`. */
function parsePageIds(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (trimmed === '') return [];
  if (!trimmed.startsWith('[')) return [trimmed];

  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : value;
  } catch {
    // Chuỗi JSON hỏng: trả nguyên si để `@IsUUID` báo lỗi có nghĩa, không nuốt.
    return value;
  }
}
