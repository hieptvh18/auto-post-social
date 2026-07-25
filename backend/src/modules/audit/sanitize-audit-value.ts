/**
 * `before_value`/`after_value` là JSONB tự do — module nào cũng ghi vào được và
 * đã từng chứa key nhạy cảm (`PAGE_TOKEN_UPDATE`, `SETTINGS_UPDATE`). Trả thẳng
 * ra API là rò rỉ token vĩnh viễn, nên **mọi** giá trị đi ra ngoài phải qua đây.
 *
 * Nguyên tắc: che theo **tên key**, đệ quy, deny-by-default (nghi ngờ thì che) —
 * cùng tinh thần với `sanitizeRawError` của publish job events.
 */

/** Khớp theo chuỗi con, không phân biệt hoa thường ⇒ bắt cả `client_secret` lẫn `clientSecret`. */
const SECRET_KEY_PATTERNS = [
  'token',
  'password',
  'secret',
  'serviceaccount',
  'service_account',
  'credential',
  'apikey',
  'api_key',
  'privatekey',
  'private_key',
];

export const MASK = '***';

const MAX_DEPTH = 6;
const MAX_ARRAY = 50;
const MAX_STRING = 2000;

export function sanitizeAuditValue(value: unknown): unknown {
  return sanitize(value, 0);
}

function sanitize(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return null;
  if (depth > MAX_DEPTH) return '[quá sâu]';
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((item) => sanitize(item, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      // Che cả cây con: `{ serviceAccount: { private_key, client_email } }`
      // vẫn phải biến mất hoàn toàn, không chỉ riêng lá có tên nhạy cảm.
      result[key] = isSecretKey(key) ? MASK : sanitize(item, depth + 1);
    }
    return result;
  }
  // symbol/function/bigint — không có ý nghĩa khi xem lịch sử thao tác.
  return `[${typeof value}]`;
}

export function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

function truncate(text: string): string {
  return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
}
