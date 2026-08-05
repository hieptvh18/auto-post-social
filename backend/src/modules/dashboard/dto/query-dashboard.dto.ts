import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** `'all'` = không lọc theo loại media (khớp `SlotMediaType` của auto-post). */
export enum DashboardMediaType {
  image = 'image',
  video = 'video',
  all = 'all',
}

/**
 * Khoảng ngày chung của mọi endpoint Dashboard. Ngày hiểu theo
 * `Asia/Ho_Chi_Minh`; bỏ trống ⇒ 7 ngày gần nhất (`resolveDashboardRange`).
 */
export class QueryDashboardDto {
  @ApiPropertyOptional({
    example: '2026-07-19',
    description:
      "Từ ngày (tính cả ngày này), 'YYYY-MM-DD' theo Asia/Ho_Chi_Minh. Bỏ trống = 7 ngày gần nhất",
  })
  @IsOptional()
  @Matches(DATE_REGEX, { message: "from phải có dạng 'YYYY-MM-DD'" })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-07-25',
    description:
      "Đến ngày (tính cả ngày này), 'YYYY-MM-DD'. Bỏ trống = hôm nay",
  })
  @IsOptional()
  @Matches(DATE_REGEX, { message: "to phải có dạng 'YYYY-MM-DD'" })
  to?: string;
}

export class QueryPostsByPageDto extends QueryDashboardDto {
  @ApiPropertyOptional({ enum: DashboardMediaType, default: 'all' })
  @IsOptional()
  @IsEnum(DashboardMediaType)
  mediaType: DashboardMediaType = DashboardMediaType.all;
}

/** Mặc định top 10 — đúng yêu cầu user, cho phép đổi trong khoảng hợp lý. */
export const DEFAULT_TOP_CATEGORIES_LIMIT = 10;
const MAX_TOP_CATEGORIES_LIMIT = 50;

export class QueryTopCategoriesDto extends QueryDashboardDto {
  @ApiPropertyOptional({
    default: DEFAULT_TOP_CATEGORIES_LIMIT,
    description:
      'Số danh mục tối đa trả về, xếp theo bài đăng thành công giảm dần',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TOP_CATEGORIES_LIMIT)
  limit: number = DEFAULT_TOP_CATEGORIES_LIMIT;
}
