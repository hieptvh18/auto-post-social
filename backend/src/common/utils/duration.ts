const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/**
 * Đổi chuỗi kiểu '15m' / '7d' / '900' sang số giây — dùng cho field `expiresIn`
 * trong response login. Sai định dạng ⇒ ném lỗi để phát hiện ngay lúc cấu hình sai.
 */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])?$/.exec(value.trim());
  if (match === null) {
    throw new Error(`Chuỗi thời hạn không hợp lệ: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  return unit === undefined ? amount : amount * UNIT_SECONDS[unit];
}
