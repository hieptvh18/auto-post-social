import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsString } from 'class-validator';

/**
 * Định dạng `HH:mm` và luật "hai giờ không được trùng" kiểm ở **service**
 * (rule 01 §DTO: ràng buộc chéo field cần đọc state) — ở đây chỉ chặn sai kiểu.
 */
export class UpdateReupScheduleDto {
  @ApiProperty({
    description: 'Bật/tắt cron quét video. Tắt vẫn "Quét ngay" được.',
  })
  @IsBoolean()
  discoveryEnabled!: boolean;

  @ApiProperty({
    description: "Giờ quét, dạng 'HH:mm' theo giờ VN.",
    example: '02:00',
  })
  @IsString()
  discoveryTime!: string;

  @ApiProperty({ description: 'Bật/tắt cron dọn dẹp file.' })
  @IsBoolean()
  cleanupEnabled!: boolean;

  @ApiProperty({
    description: "Giờ dọn dẹp, dạng 'HH:mm' theo giờ VN.",
    example: '03:00',
  })
  @IsString()
  cleanupTime!: string;
}
