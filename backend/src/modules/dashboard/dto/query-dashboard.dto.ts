import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

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

/** Plan 35: đếm số bài đã đăng theo từng ngày hay gộp theo tháng. */
export enum PublishReportGroupBy {
  day = 'day',
  month = 'month',
}

const MAX_REPORT_PAGE_IDS = 100;
const MAX_REPORT_CATEGORIES = 50;

/**
 * Query string chỉ có chuỗi: `pageIds=a,b` hoặc lặp `pageIds=a&pageIds=b` đều
 * được. Tách theo dấu phẩy, bỏ phần rỗng; không có gì ⇒ `undefined` (không lọc).
 */
function toStringList(value: unknown): string[] | undefined {
  const raw = Array.isArray(value) ? value : [value];
  const items = raw
    .filter((item): item is string => typeof item === 'string')
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items.length > 0 ? [...new Set(items)] : undefined;
}

/**
 * Tab "Thống kê đăng bài" (plan 35) — bổ sung ngoài `docs/04` §8.
 * Kế thừa `from`/`to`/`mediaType` của chart theo page.
 */
export class QueryPublishReportDto extends QueryPostsByPageDto {
  @ApiPropertyOptional({
    enum: PublishReportGroupBy,
    default: PublishReportGroupBy.day,
  })
  @IsOptional()
  @IsEnum(PublishReportGroupBy)
  groupBy: PublishReportGroupBy = PublishReportGroupBy.day;

  @ApiPropertyOptional({
    type: String,
    description:
      'Danh sách id page (uuid nội bộ), ngăn cách bằng dấu phẩy. Bỏ trống = mọi page',
  })
  @IsOptional()
  @Transform(({ value }): unknown => toStringList(value))
  @IsArray()
  @ArrayMaxSize(MAX_REPORT_PAGE_IDS)
  @IsUUID('all', { each: true })
  pageIds?: string[];

  @ApiPropertyOptional({
    type: String,
    description:
      'Danh sách danh mục ("Dạng"), ngăn cách bằng dấu phẩy. Bỏ trống = mọi danh mục',
  })
  @IsOptional()
  @Transform(({ value }): unknown => toStringList(value))
  @IsArray()
  @ArrayMaxSize(MAX_REPORT_CATEGORIES)
  @IsString({ each: true })
  categories?: string[];
}
