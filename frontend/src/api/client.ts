import { env } from '../config/env';
import { tokenStore } from './tokenStore';

/**
 * Lỗi backend đã chuẩn hoá (khớp filter `http-exception.filter.ts`):
 * `{ statusCode, message, error, correlationId }`. `message` có thể là mảng
 * (lỗi validate) — gộp lại thành 1 chuỗi ở `message`, giữ mảng gốc ở `messages`.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly messages: string[];

  constructor(statusCode: number, message: string | string[]) {
    const messages = Array.isArray(message) ? message : [message];
    super(messages.join('; '));
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.messages = messages;
  }
}

/** Gọi khi refresh thất bại — AuthContext gắn hàm dọn phiên + chuyển /login. */
let onAuthExpired: (() => void) | null = null;
export function setOnAuthExpired(fn: () => void): void {
  onAuthExpired = fn;
}

interface RequestOptions {
  method?: string;
  /** JSON body — bỏ qua nếu truyền `formData`. */
  body?: unknown;
  /** Multipart — không set Content-Type để trình duyệt tự gắn boundary. */
  formData?: FormData;
  /** Không gắn Bearer (login/refresh). */
  skipAuth?: boolean;
}

function buildUrl(path: string): string {
  const base = env.apiBaseUrl.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Lỗi từ hạ tầng đứng trước backend (Nginx/CDN) — không phải JSON của app nên
 * `res.json()` ném lỗi, rơi vào nhánh catch của `parseError`. Riêng HTTP/2 (phổ
 * biến qua HTTPS) bỏ hẳn reason phrase nên `res.statusText` luôn rỗng — không
 * còn gì để hiện ngoài "Lỗi không xác định", dù nguyên nhân (vd file quá lớn)
 * hoàn toàn xác định được qua mã trạng thái.
 */
const NON_JSON_STATUS_MESSAGES: Record<number, string> = {
  413: 'File tải lên quá lớn, vượt quá giới hạn cho phép của server/proxy. Vui lòng nén hoặc chia nhỏ file rồi thử lại.',
  502: 'Server tạm thời không phản hồi (502 Bad Gateway). Vui lòng thử lại sau.',
  503: 'Server đang quá tải hoặc bảo trì (503). Vui lòng thử lại sau.',
  504: 'Quá thời gian chờ phản hồi (504 Gateway Timeout) — file lớn có thể cần nhiều thời gian hơn. Vui lòng thử lại.',
};

async function parseError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    return new ApiError(res.status, body.message ?? res.statusText);
  } catch {
    const message =
      NON_JSON_STATUS_MESSAGES[res.status] ??
      res.statusText ??
      `Lỗi không xác định (mã ${res.status})`;
    return new ApiError(res.status, message || `Lỗi không xác định (mã ${res.status})`);
  }
}

/** Refresh token đúng MỘT lần; nhiều request 401 song song dùng chung 1 promise. */
let refreshPromise: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = tokenStore.refresh;
  if (!refreshToken) return false;

  const res = await fetch(buildUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;

  const data = (await res.json()) as {
    accessToken: string;
    refreshToken: string;
  };
  tokenStore.set({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
  });
  return true;
}

async function doFetch(
  path: string,
  opts: RequestOptions,
  accessToken: string | null,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (!opts.formData) headers['Content-Type'] = 'application/json';
  if (!opts.skipAuth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return fetch(buildUrl(path), {
    method: opts.method ?? 'GET',
    headers,
    body: opts.formData ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
}

/**
 * Wrapper fetch dùng chung. Gắn Bearer; khi 401 (và không phải request skipAuth)
 * thử refresh đúng 1 lần rồi retry. Refresh fail ⇒ dọn phiên + báo AuthContext.
 */
export async function apiRequest<T>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  let res = await doFetch(path, opts, tokenStore.access);

  if (res.status === 401 && !opts.skipAuth) {
    refreshPromise ??= refreshTokens().finally(() => {
      refreshPromise = null;
    });
    const refreshed = await refreshPromise;

    if (refreshed) {
      res = await doFetch(path, opts, tokenStore.access);
    } else {
      tokenStore.clear();
      onAuthExpired?.();
      throw new ApiError(401, 'Phiên đăng nhập đã hết hạn');
    }
  }

  if (!res.ok) throw await parseError(res);

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
