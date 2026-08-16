import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

export class UpdateReupCleanupSettingsDto {
  @ApiProperty({
    description:
      'Mặc định false — bật tay sau khi xem trước danh sách sẽ bị xoá.',
  })
  @IsBoolean()
  enabled!: boolean;

  @ApiProperty({
    description: 'Số ngày kể từ lúc đăng thì file được xoá. 1..365.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  retentionDays!: number;
}
