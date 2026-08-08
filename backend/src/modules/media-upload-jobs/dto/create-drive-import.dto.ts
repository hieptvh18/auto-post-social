import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Nhập bài từ link Drive — người dùng chỉ phải nhập danh sách link, có gộp ảnh
 * hay không (yêu cầu user 2026-08-07) và có copy dữ liệu về Drive của tool hay
 * chỉ lưu link (yêu cầu user 2026-08-08).
 *
 * Mọi thứ còn lại suy ra tự động: tiêu đề = tên file, caption = `'-'` (⇒ bài vào
 * Chờ duyệt), danh mục = `DEFAULT_IMPORT_CATEGORY`, không gán page/editor. Người
 * dùng sửa các field đó sau ở màn Quản lý Ảnh/Video như với bài thường.
 */
export class CreateDriveImportDto {
  @ApiProperty({
    type: [String],
    description: 'Mỗi phần tử là một dòng người dùng dán (link file Drive)',
    example: ['https://drive.google.com/file/d/1AbCdEf.../view?usp=sharing'],
  })
  @IsArray()
  @IsString({ each: true })
  links!: string[];

  @ApiPropertyOptional({
    description:
      'true = gom mọi ảnh hợp lệ thành MỘT bài nhiều ảnh; false/bỏ trống = mỗi dòng một bài',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  mergeImagesIntoOnePost?: boolean;

  @ApiPropertyOptional({
    description:
      'true = copy file về folder Drive của tool (như cũ); false/bỏ trống = CHỈ lưu link, không tốn dung lượng Drive đang cấu hình',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  copyData?: boolean;
}
