import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateFacebookPageDto {
  @ApiProperty({ example: 'Luca — Hà Nội' })
  @IsString()
  pageName!: string;

  @ApiProperty({ example: '123456789' })
  @IsString()
  pageId!: string;

  @ApiProperty({
    description: 'Access token thô — sẽ được mã hoá trước khi lưu',
  })
  @IsString()
  @MinLength(1)
  accessToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  tokenExpireAt?: string;
}
