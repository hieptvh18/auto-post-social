const MASK_PREFIX = '••••';
const VISIBLE_CHARS = 4;
/** Hiển thị khi không giải mã được token (khoá đã đổi) — không phải mask thật. */
export const UNKNOWN_TOKEN_MASK = '••••????';

/** Mask token plaintext: giữ lại 4 ký tự cuối (rule 01 §Bảo mật, docs/02 §7.3). */
export function maskToken(plain: string): string {
  return `${MASK_PREFIX}${plain.slice(-VISIBLE_CHARS)}`;
}
