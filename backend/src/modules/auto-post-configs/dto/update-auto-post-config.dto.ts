import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** Bật/tắt auto-post ở mức page (`facebook_pages.autopost_enabled`). */
export class UpdateAutoPostConfigDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;
}
