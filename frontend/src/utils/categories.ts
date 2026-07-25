import type { CategorySuggestion } from '../types';
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

/** Chuẩn hoá tên danh mục người dùng gõ. `null` khi gõ toàn khoảng trắng. */
export function normalizeCategory(raw: string): string | null {
  const value = raw.trim().replace(/\s+/g, ' ');
  return value === '' ? null : value;
}
