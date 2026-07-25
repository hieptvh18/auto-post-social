/**
 * Hashtag lưu trong DB là **một chuỗi** (`content_assets.hashtags`, ví dụ
 * `'#tưthế #vănphòng'`) vì bot đăng bài ghép thẳng chuỗi này vào caption.
 * UI lại làm việc theo từng tag ⇒ 2 hàm dưới là ranh giới quy đổi duy nhất.
 */

/** Tách chuỗi hashtag thành từng tag đã chuẩn hoá, bỏ trùng (không phân biệt hoa/thường). */
export function parseHashtags(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];

  const seen = new Set<string>();
  const tags: string[] = [];

  for (const token of raw.split(/[\s,]+/)) {
    const tag = normalizeHashtag(token);
    if (tag === null) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }

  return tags;
}

/** Ghép danh sách tag về đúng dạng chuỗi lưu DB. Mảng rỗng ⇒ chuỗi rỗng. */
export function formatHashtags(tags: string[]): string {
  return parseHashtags(tags.join(' ')).join(' ');
}

/**
 * Thêm `#` nếu người dùng gõ thiếu, bỏ khoảng trắng và `#` thừa.
 * Trả `null` khi token không còn ký tự nào có nghĩa.
 */
export function normalizeHashtag(token: string): string | null {
  const body = token.trim().replace(/^#+/, '').replace(/\s+/g, '');
  return body === '' ? null : `#${body}`;
}
