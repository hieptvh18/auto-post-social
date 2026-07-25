import { describe, expect, it } from 'vitest';
import { formatHashtags, normalizeHashtag, parseHashtags } from '../hashtags';

describe('parseHashtags', () => {
  it('tách chuỗi theo khoảng trắng và dấu phẩy', () => {
    expect(parseHashtags('#tưthế, #vănphòng  #cxk')).toEqual([
      '#tưthế',
      '#vănphòng',
      '#cxk',
    ]);
  });

  it('tự thêm # cho token người dùng gõ thiếu', () => {
    expect(parseHashtags('cxk #phucan')).toEqual(['#cxk', '#phucan']);
  });

  it('bỏ tag trùng không phân biệt hoa/thường, giữ lần xuất hiện đầu', () => {
    expect(parseHashtags('#CXK #cxk #Cxk')).toEqual(['#CXK']);
  });

  it('trả mảng rỗng với null/undefined/chuỗi rỗng', () => {
    expect(parseHashtags(null)).toEqual([]);
    expect(parseHashtags(undefined)).toEqual([]);
    expect(parseHashtags('   ')).toEqual([]);
  });

  it('bỏ token chỉ có dấu #', () => {
    expect(parseHashtags('# ## #ok')).toEqual(['#ok']);
  });
});

describe('formatHashtags', () => {
  it('ghép về chuỗi lưu DB, chuẩn hoá và bỏ trùng', () => {
    expect(formatHashtags(['cxk', '#CXK', '#phucan'])).toBe('#cxk #phucan');
  });

  it('mảng rỗng ⇒ chuỗi rỗng', () => {
    expect(formatHashtags([])).toBe('');
  });
});

describe('normalizeHashtag', () => {
  it('bỏ # thừa và khoảng trắng giữa chừng', () => {
    expect(normalizeHashtag('  ##tư thế ')).toBe('#tưthế');
  });

  it('trả null khi không còn ký tự có nghĩa', () => {
    expect(normalizeHashtag('###')).toBeNull();
  });
});
