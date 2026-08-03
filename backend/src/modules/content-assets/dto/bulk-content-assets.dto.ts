import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsUUID,
} from 'class-validator';

/**
 * Trần một lô. Xoá 100 bài = 100 lần gọi Google Drive; bỏ trần thì một cú bấm
 * nhầm đủ để treo cả process (plan 19 §2.3).
 */
export const BULK_MAX_ITEMS = 100;

export class BulkIdsDto {
  @ApiProperty({
    type: [String],
    description: `Tối đa ${BULK_MAX_ITEMS} id mỗi lần`,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(BULK_MAX_ITEMS)
  @IsUUID(undefined, { each: true })
  ids!: string[];
}

export class BulkSetActiveDto extends BulkIdsDto {
  @ApiProperty({
    description: '`true` = dùng lại, `false` = ngưng dùng (Bot không lấy nữa)',
  })
  @IsBoolean()
  isActive!: boolean;
}
