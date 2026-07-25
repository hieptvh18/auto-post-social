import { describe, expect, it } from 'vitest';
import { mergeCategoryOptions, normalizeCategory } from '../categories';
import { CONTENT_CATEGORIES } from '../constants';

describe('mergeCategoryOptions', () => {
  it('đưa danh mục từ API lên trước, giữ nguyên thứ tự backend đã xếp', () => {
    const result = mergeCategoryOptions([
      { category: 'Khuyến mãi', count: 9 },
      { category: 'Tin nội bộ', count: 2 },
    ]);

    expect(result.slice(0, 2)).toEqual(['Khuyến mãi', 'Tin nội bộ']);
  });

  it('bổ sung danh sách mồi để DB rỗng vẫn có lựa chọn', () => {
    expect(mergeCategoryOptions(undefined)).toEqual([...CONTENT_CATEGORIES]);
  });

  it('không lặp danh mục chỉ khác hoa/thường hoặc khoảng trắng', () => {
    const result = mergeCategoryOptions([{ category: ' thăm khám ', count: 1 }]);

    expect(result.filter((c) => c.toLowerCase().trim() === 'thăm khám')).toEqual(
      ['thăm khám'],
    );
  });

  it('đảm bảo giá trị đang chọn luôn có trong danh sách', () => {
    const result = mergeCategoryOptions([], ['Danh mục lạ']);

    expect(result).toContain('Danh mục lạ');
  });

  it('bỏ qua giá trị rỗng/null', () => {
    const result = mergeCategoryOptions([{ category: '  ', count: 3 }], [null, '']);

    expect(result).toEqual([...CONTENT_CATEGORIES]);
  });
});

describe('normalizeCategory', () => {
  it('gom khoảng trắng thừa', () => {
    expect(normalizeCategory('  Thăm   khám ')).toBe('Thăm khám');
  });

  it('trả null khi chỉ có khoảng trắng', () => {
    expect(normalizeCategory('   ')).toBeNull();
  });
});
