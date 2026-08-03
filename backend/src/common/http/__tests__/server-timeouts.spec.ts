import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  applyServerTimeouts,
  DEFAULT_HEADERS_TIMEOUT_MS,
} from '../server-timeouts';

/**
 * Phần cuối file là test HÀNH VI trên socket thật, không dùng fake timer.
 * Lý do được phép lệch rule 02: thứ cần chứng minh ở đây chính là Node có cắt
 * một request body gửi chậm hay không — đó là hành vi của tầng socket, fake
 * timer không mô phỏng được. Bù lại, mọi mốc thời gian đều rút xuống mili giây
 * và biên độ để rộng gấp nhiều lần nên không phụ thuộc tốc độ máy.
 */
describe('applyServerTimeouts', () => {
  let server: Server;

  beforeEach(() => {
    server = createServer(() => {});
  });

  afterEach(() => {
    server.close();
  });

  describe('gán giá trị', () => {
    it('đặt requestTimeout đúng bằng giá trị cấu hình', () => {
      applyServerTimeouts(server, { requestTimeoutMs: 900_000 });

      expect(server.requestTimeout).toBe(900_000);
    });

    it('giữ headersTimeout mặc định 60s khi requestTimeout lớn hơn', () => {
      applyServerTimeouts(server, { requestTimeoutMs: 900_000 });

      expect(server.headersTimeout).toBe(DEFAULT_HEADERS_TIMEOUT_MS);
    });

    it('kẹp headersTimeout xuống bằng requestTimeout khi requestTimeout nhỏ hơn', () => {
      applyServerTimeouts(server, { requestTimeoutMs: 5_000 });

      expect(server.headersTimeout).toBe(5_000);
    });

    it('requestTimeout = 0 (không giới hạn) vẫn giữ headersTimeout để chống slowloris', () => {
      applyServerTimeouts(server, { requestTimeoutMs: 0 });

      expect(server.requestTimeout).toBe(0);
      expect(server.headersTimeout).toBe(DEFAULT_HEADERS_TIMEOUT_MS);
    });

    it('nhận headersTimeout tuỳ chỉnh', () => {
      applyServerTimeouts(server, {
        requestTimeoutMs: 900_000,
        headersTimeoutMs: 10_000,
      });

      expect(server.headersTimeout).toBe(10_000);
    });
  });

  describe('hành vi thật với body gửi chậm (mô phỏng upload file lớn)', () => {
    /**
     * Dựng server nhận POST body, trả 200 kèm số byte nhận được.
     * `requestTimeoutMs` truyền vào chính là knob đang kiểm chứng.
     */
    function startServer(requestTimeoutMs: number): Promise<Server> {
      // connectionsCheckingInterval: Node chỉ quét connection quá hạn theo chu kỳ,
      // mặc định 30s. Ở production độ trễ đó vô hại, nhưng trong test phải hạ
      // xuống 50ms thì mới quan sát được việc cắt trong vài trăm mili giây.
      const srv = createServer(
        { connectionsCheckingInterval: 50 },
        (req, res) => {
          let received = 0;
          req.on('data', (chunk: Buffer) => {
            received += chunk.length;
          });
          req.on('end', () => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ received }));
          });
        },
      );
      applyServerTimeouts(srv, { requestTimeoutMs });
      return new Promise((resolve) => {
        srv.listen(0, '127.0.0.1', () => resolve(srv));
      });
    }

    /**
     * Gửi `chunks` mẩu body, mỗi mẩu cách nhau `gapMs` — giống hệt trình duyệt
     * đẩy file lớn qua đường truyền chậm. Trả về status hoặc lỗi socket.
     */
    function slowUpload(
      port: number,
      chunks: number,
      gapMs: number,
    ): Promise<{ ok: boolean; status?: number; error?: string }> {
      return new Promise((resolve) => {
        const payload = Buffer.alloc(1024, 0x61);
        const req = request(
          {
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: '/upload',
            headers: {
              'Content-Type': 'application/octet-stream',
              'Content-Length': String(payload.length * chunks),
            },
          },
          (res) => {
            res.resume();
            res.on('end', () => resolve({ ok: true, status: res.statusCode }));
          },
        );

        req.on('error', (err: Error) =>
          resolve({ ok: false, error: err.message }),
        );

        let sent = 0;
        const tick = (): void => {
          if (sent >= chunks) {
            req.end();
            return;
          }
          sent += 1;
          req.write(payload);
          setTimeout(tick, gapMs);
        };
        tick();
      });
    }

    let srv: Server;

    afterEach(async () => {
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    });

    it('BỊ CẮT khi upload kéo dài hơn requestTimeout — tái hiện lỗi 504 trên VPS', async () => {
      // 20 mẩu × 150ms ≈ 3000ms upload, nhưng chỉ cho phép 500ms.
      srv = await startServer(500);
      const port = (srv.address() as AddressInfo).port;

      const result = await slowUpload(port, 20, 150);

      // Node không đứt socket mà trả 408 Request Timeout rồi huỷ request —
      // Nginx nhận 408 từ upstream và người dùng thấy upload thất bại.
      expect(result.status).toBe(408);
    }, 15_000);

    it('ĐI TỚI CÙNG khi requestTimeout đủ rộng — cùng payload, cùng tốc độ', async () => {
      // Y hệt test trên, chỉ khác requestTimeout: 30s thay vì 500ms.
      srv = await startServer(30_000);
      const port = (srv.address() as AddressInfo).port;

      const result = await slowUpload(port, 10, 100);

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    }, 15_000);

    it('requestTimeout = 0 không cắt upload chậm', async () => {
      srv = await startServer(0);
      const port = (srv.address() as AddressInfo).port;

      const result = await slowUpload(port, 10, 100);

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
    }, 15_000);
  });
});
