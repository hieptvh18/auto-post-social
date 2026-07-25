import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateManualPostDto {
  @ApiProperty({ description: 'ID nội bộ của Facebook Page (uuid)' })
  @IsUUID()
  pageId!: string;

  @ApiProperty({ description: 'ID bài trong kho nội dung (uuid)' })
  @IsUUID()
  contentAssetId!: string;

  @ApiProperty({
    description:
      'Caption dùng cho LẦN ĐĂNG NÀY — sửa ở đây không đổi caption gốc của bài',
  })
  @IsString()
  @IsNotEmpty({ message: 'Caption không được để trống' })
  caption!: string;

  @ApiPropertyOptional({ example: '#suckhoe #phongkham' })
  @IsOptional()
  @IsString()
  hashtags?: string;
}
