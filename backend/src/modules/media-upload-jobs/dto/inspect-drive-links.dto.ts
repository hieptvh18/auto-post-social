import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

/**
 * Dò loại file của từng link — **chỉ đọc metadata, không tạo gì cả**.
 *
 * Sinh ra để UI biết được lô đang dán có video hay không mà **khoá checkbox
 * "gộp ảnh"** ngay tại chỗ: Facebook không ghép video (và không trộn ảnh–video)
 * vào một bài feed, nên tick rồi mới báo lỗi lúc submit là quá muộn.
 */
export class InspectDriveLinksDto {
  @ApiProperty({
    type: [String],
    description: 'Mỗi phần tử là một dòng người dùng dán (link file Drive)',
  })
  @IsArray()
  @IsString({ each: true })
  links!: string[];
}
