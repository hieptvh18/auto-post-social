import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { ContentStatus } from '../../../../generated/prisma/client';

/**
 * Endpoint PATCH duy nhất cho cả sửa nội dung lẫn duyệt bài (plan 04 §3).
 *
 * `status`/`isAds`/`rejectComment` đòi permission `content:review` — kiểm ở
 * **service** chứ không phải DTO vì cần biết role của actor. Ràng buộc chéo
 * field (REJECTED bắt buộc có lý do) cũng ở service vì phải đọc state trong DB.
 */
export class UpdateContentAssetDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hashtags?: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Người DỰNG video/ảnh (role EDITOR đang hoạt động). Gửi `null` để gỡ.',
  })
  @IsOptional()
  // Cho phép `null` = gỡ editor; mọi giá trị khác vẫn phải là UUID.
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  editorId?: string | null;

  @ApiPropertyOptional({
    enum: ContentStatus,
    description:
      'Chỉ EDITOR/ADMIN. PUBLISHING/PUBLISHED chỉ Bot set ⇒ client gửi lên nhận 422',
  })
  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @ApiPropertyOptional({ description: 'Đạt ADS — chỉ EDITOR/ADMIN' })
  @IsOptional()
  @IsBoolean()
  isAds?: boolean;

  @ApiPropertyOptional({
    description:
      '`false` = ngưng dùng (Bot không lấy bài này nữa). Không phải field duyệt ⇒ ai sửa được bài thì đổi được',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Bắt buộc khi chuyển sang REJECTED' })
  @IsOptional()
  @IsString()
  rejectComment?: string;

  @ApiPropertyOptional({
    description:
      'Page bài sẽ được đăng lên — gửi lên là thay thế toàn bộ, service tự diff',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  assignedPageIds?: string[];
}
