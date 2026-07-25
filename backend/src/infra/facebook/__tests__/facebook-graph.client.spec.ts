import type { AppConfigService } from '../../../config/app-config.service';
import { FacebookGraphClient } from '../facebook-graph.client';
import { FacebookGraphError } from '../facebook.errors';

const config = {
  facebook: { appId: undefined, appSecret: undefined, graphVersion: 'v21.0' },
} as AppConfigService;

/** Response giả — chỉ cần `ok` và `json()` như client dùng. */
const jsonResponse = (status: number, body: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as Response;

describe('FacebookGraphClient', () => {
  let fetchMock: jest.Mock<Promise<Response>, [string, RequestInit]>;
  let client: FacebookGraphClient;

  beforeEach(() => {
    fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    client = new FacebookGraphClient(config);
  });

  describe('getPage', () => {
    it('gọi đúng URL kèm version, và gửi token qua header chứ không qua query', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          id: '123',
          name: 'Luca',
          category: 'Retail',
        }),
      );

      const probe = await client.getPage('123', 'secret-token');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/v21.0/123?fields=id,name,category');
      // `tasks` chỉ có trên /me/accounts — hỏi ở đây là Graph trả (#100).
      expect(url).not.toContain('tasks');
      expect(url).not.toContain('secret-token');
      expect(init.headers).toEqual({ Authorization: 'Bearer secret-token' });
      expect(probe).toEqual({ id: '123', name: 'Luca', category: 'Retail' });
    });

    it('field thiếu trong response ⇒ trả null chứ không vỡ', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { id: '123', name: 'Luca' }),
      );

      const probe = await client.getPage('123', 'tok');

      expect(probe.category).toBeNull();
    });

    it('map code 190 thành lỗi token hết hạn', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(401, {
          error: { message: 'Session expired', code: 190 },
        }),
      );

      await expect(client.getPage('123', 'tok')).rejects.toThrow(/hết hạn/);
    });

    it('map code 100 thành lỗi sai Page ID', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, {
          error: { message: 'Unsupported get request', code: 100 },
        }),
      );

      await expect(client.getPage('123', 'tok')).rejects.toThrow(
        /Facebook Page ID/,
      );
    });

    it('map code 200 thành lỗi thiếu quyền', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(403, {
          error: { message: 'Permissions error', code: 200 },
        }),
      );

      await expect(client.getPage('123', 'tok')).rejects.toThrow(/thiếu quyền/);
    });

    it('map code 4 thành lỗi rate limit', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, { error: { message: 'rate limit', code: 4 } }),
      );

      await expect(client.getPage('123', 'tok')).rejects.toThrow(/rate limit/);
    });

    it('lỗi lạ vẫn thành FacebookGraphError kèm message gốc', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(500, { error: { message: 'Internal', code: 1 } }),
      );

      await expect(client.getPage('123', 'tok')).rejects.toThrow(
        FacebookGraphError,
      );
      await expect(client.getPage('123', 'tok')).rejects.toThrow(/Internal/);
    });

    it('mất mạng / timeout ⇒ lỗi kết nối, không rò lỗi hạ tầng ra ngoài', async () => {
      fetchMock.mockRejectedValue(new Error('fetch failed'));

      await expect(client.getPage('123', 'tok')).rejects.toThrow(
        /Không kết nối được tới Facebook/,
      );
    });

    it('ném lỗi khi Graph trả 200 nhưng không có id', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { name: 'Luca' }));

      await expect(client.getPage('123', 'tok')).rejects.toThrow(
        /không trả về ID/,
      );
    });
  });

  describe('debugToken', () => {
    it('đọc đúng loại token, chủ sở hữu, scope và hạn dùng', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          data: {
            type: 'PAGE',
            is_valid: true,
            profile_id: '111',
            scopes: ['pages_manage_posts'],
            expires_at: 1784959200,
          },
        }),
      );

      const info = await client.debugToken('tok');

      expect(info.type).toBe('PAGE');
      expect(info.isValid).toBe(true);
      expect(info.profileId).toBe('111');
      expect(info.scopes).toEqual(['pages_manage_posts']);
      expect(info.expiresAt).toEqual(new Date(1784959200 * 1000));
    });

    it('expires_at = 0 nghĩa là token vĩnh viễn, không phải mốc 1970', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          data: { type: 'PAGE', is_valid: true, expires_at: 0 },
        }),
      );

      const info = await client.debugToken('tok');

      expect(info.expiresAt).toBeNull();
    });

    it('loại token lạ ⇒ UNKNOWN thay vì tin lời Graph', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { data: { type: 'SOMETHING', is_valid: false } }),
      );

      const info = await client.debugToken('tok');

      expect(info.type).toBe('UNKNOWN');
      expect(info.isValid).toBe(false);
      expect(info.scopes).toEqual([]);
    });
  });
});
