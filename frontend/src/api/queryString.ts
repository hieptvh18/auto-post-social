/**
 * Ghép query string, bỏ qua giá trị rỗng/undefined — mọi api layer dùng chung
 * để không nơi nào gửi `?status=undefined` lên backend (backend sẽ 400).
 */
export function toQueryString<T extends object>(params: T): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs === '' ? '' : `?${qs}`;
}
