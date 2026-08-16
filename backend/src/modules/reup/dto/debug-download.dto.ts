import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';

export class DebugDownloadDto {
  @ApiProperty({ example: 'https://www.youtube.com/watch?v=abc123' })
  @IsString()
  @IsUrl({ require_protocol: true })
  url!: string;
}
