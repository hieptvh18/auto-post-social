import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** Test cấu hình **chưa lưu** — dùng cho form thêm page / khi vừa nhập token mới. */
export class TestFacebookConnectionDto {
  @ApiProperty({ example: '123456789' })
  @IsString()
  @MinLength(1)
  pageId!: string;

  @ApiProperty({
    description: 'Access token thô — chỉ dùng để gọi thử, không lưu',
  })
  @IsString()
  @MinLength(1)
  accessToken!: string;
}
