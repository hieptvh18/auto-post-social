import type { Server } from 'node:http';

/**
 * Timeout tầng Node HTTP server.
 *
 * Node đặt sẵn `requestTimeout = 300_000ms` — đây là **tổng thời gian nhận trọn
 * một request, tính cả body**. Với Nginx cấu hình `proxy_request_buffering off`,
 * backend nhận file theo đúng tốc độ mạng của người upload, nên một video 300MB
 * từ đường truyền chậm sẽ vượt 300s và bị **Node** cắt (`408`, Nginx trả ra
 * `502/504`) — nới timeout bên Nginx KHÔNG cứu được, vì thủ phạm nằm ở Node.
 *
 * `headersTimeout` phải <= `requestTimeout`, nếu không Node cảnh báo và hành vi
 * không xác định — nên kẹp lại thay vì tin vào giá trị truyền vào.
 */
export interface ServerTimeoutOptions {
  /** Tổng thời gian nhận trọn request (ms). `0` = không giới hạn. */
  requestTimeoutMs: number;
  /** Thời gian chờ nhận xong phần header (ms). Mặc định Node là 60_000. */
  headersTimeoutMs?: number;
}

export const DEFAULT_HEADERS_TIMEOUT_MS = 60_000;

export function applyServerTimeouts(
  server: Server,
  options: ServerTimeoutOptions,
): void {
  const { requestTimeoutMs } = options;
  const headersTimeoutMs =
    options.headersTimeoutMs ?? DEFAULT_HEADERS_TIMEOUT_MS;

  server.requestTimeout = requestTimeoutMs;
  // requestTimeout = 0 nghĩa là không giới hạn ⇒ headersTimeout giữ nguyên.
  server.headersTimeout =
    requestTimeoutMs === 0
      ? headersTimeoutMs
      : Math.min(headersTimeoutMs, requestTimeoutMs);
}
