import type { CategoryAvailability, CategorySuggestion } from '../types';
import { CONTENT_CATEGORIES } from './constants';

/**
 * Danh mục ("Dạng" bài) **không có bảng riêng** — gõ tên mới ở form là có danh
 * mục mới, giống hashtag. Nguồn hiển thị là danh mục đang thực sự có bài
 * (`GET /content-assets/categories`), còn `CONTENT_CATEGORIES` chỉ là danh sách
 * mồi cho DB rỗng để form không trống trơn ngày đầu.
 *
 * @param suggestions danh mục từ API, đã xếp theo số bài giảm dần
 * @param extra giá trị đang chọn / cần đảm bảo có trong danh sách
 */
export function mergeCategoryOptions(
  suggestions: CategorySuggestion[] | undefined,
  extra: (string | null | undefined)[] = [],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const push = (raw: string | null | undefined): void => {
    if (raw === null || raw === undefined) return;
    const value = raw.trim();
    if (value === '') return;
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(value);
  };

  for (const item of suggestions ?? []) push(item.category);
  for (const item of CONTENT_CATEGORIES) push(item);
  for (const item of extra) push(item);

  return result;
}

/** Một dòng danh mục trong form mốc giờ, kèm kho bài của page đang chọn. */
export interface CategoryOptionWithStock {
  category: string;
  imageCount: number;
  videoCount: number;
  /** Không còn bài nào Bot đăng được cho page này ⇒ hiện mờ + ghi "hết bài". */
  isEmpty: boolean;
}

/**
 * Ghép danh sách danh mục (toàn kho + danh sách mồi) với kho bài **của riêng một
 * page**. Danh mục page không còn bài vẫn giữ lại (isEmpty) chứ không ẩn: mốc giờ
 * có thể cấu hình trước cho danh mục sắp có bài, nhưng phải nhìn là biết ngay
 * cấu hình xong Bot sẽ ra `NO_MATCH`.
 *
 * Xếp danh mục còn bài lên trước, nhiều bài trước; hết bài dồn xuống cuối.
 */
export function buildCategoryOptionsWithStock(
  categories: string[],
  availability: CategoryAvailability[] | undefined,
): CategoryOptionWithStock[] {
  const stock = new Map(
    (availability ?? []).map((item) => [item.category.trim().toLowerCase(), item]),
  );

  const options = categories.map((category) => {
    const found = stock.get(category.trim().toLowerCase());
    const imageCount = found?.imageCount ?? 0;
    const videoCount = found?.videoCount ?? 0;
    return {
      category,
      imageCount,
      videoCount,
      isEmpty: imageCount + videoCount === 0,
    };
  });

  return options.sort(
    (a, b) => b.imageCount + b.videoCount - (a.imageCount + a.videoCount),
  );
}

/** Chuẩn hoá tên danh mục người dùng gõ. `null` khi gõ toàn khoảng trắng. */
export function normalizeCategory(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, ' ');
  return value === '' ? null : value;
}
