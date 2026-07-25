import { Logger } from '@nestjs/common';

const logger = new Logger('FacebookGraph');

/**
 * Lỗi domain của Meta Graph (rule 01 §Lỗi — không ném lỗi HTTP thô ra ngoài).
 * Service quyết định biến nó thành kết quả `ok:false` (nút test) hay exception (publisher).
 */
export class FacebookGraphError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
  ) {
    super(message);
    this.name = 'FacebookGraphError';
  }
}

interface GraphErrorShape {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

/** Body lỗi của Graph luôn có dạng `{ error: {...} }`. */
export function readGraphError(body: unknown): GraphErrorShape {
  if (body === null || typeof body !== 'object') return {};
  const { error } = body as { error?: unknown };
  if (error === null || typeof error !== 'object') return {};
  return error;
}

/**
 * Đổi lỗi Graph thành message tiếng Việt nói được cách khắc phục.
 * Log nguyên response gốc — **không** log access token.
 */
export function mapFacebookError(body: unknown, context: string): never {
  const {
    message,
    code,
    error_subcode: subcode,
    fbtrace_id,
  } = readGraphError(body);

  logger.error(
    `Meta Graph lỗi khi ${context}: code=${String(code)} subcode=${String(
      subcode,
    )} trace=${String(fbtrace_id)} message=${String(message)}`,
  );

  // 190 = token sai/hết hạn/bị thu hồi. Đây là lỗi hay gặp nhất khi cấu hình page.
  if (code === 190) {
    throw new FacebookGraphError(
      'Access token không hợp lệ hoặc đã hết hạn. Hãy lấy lại Page Access Token mới ' +
        'trong Meta Business / Graph API Explorer rồi cập nhật lại.',
      code,
      subcode,
    );
  }

  // 100 (kèm "Unsupported get request") = ID không tồn tại hoặc token không thấy được page này.
  if (code === 100 || code === 803) {
    throw new FacebookGraphError(
      'Không đọc được Page với ID này. Kiểm tra lại Facebook Page ID, và chắc chắn ' +
        'token được cấp cho đúng page đó.',
      code,
      subcode,
    );
  }

  if (code === 200 || code === 10 || code === 3) {
    throw new FacebookGraphError(
      'Token thiếu quyền trên Page. Cần quyền pages_show_list, pages_read_engagement ' +
        'và pages_manage_posts để bot đăng bài.',
      code,
      subcode,
    );
  }

  if (code === 4 || code === 17 || code === 32 || code === 613) {
    throw new FacebookGraphError(
      'Facebook đang giới hạn tần suất gọi API (rate limit). Thử lại sau vài phút.',
      code,
      subcode,
    );
  }

  throw new FacebookGraphError(
    `Lỗi khi ${context}: ${String(message ?? 'không rõ nguyên nhân')}`,
    code,
    subcode,
  );
}
