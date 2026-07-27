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

  const APP = { appId: 'app-1', appSecret: 'app-secret' };

  describe('exchangeCodeForUserToken', () => {
    it('gửi đủ 4 tham số OAuth và KHÔNG gửi header Authorization', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { access_token: 'short-tok', expires_in: 3600 }),
      );

      await client.exchangeCodeForUserToken('the-code', 'https://app/cb', APP);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('/v21.0/oauth/access_token?');
      expect(url).toContain('client_id=app-1');
      expect(url).toContain('code=the-code');
      expect(url).toContain('redirect_uri=https%3A%2F%2Fapp%2Fcb');
      // Endpoint này xác thực bằng client_secret trên query — thêm header sẽ bị từ chối.
      expect(init.headers).toEqual({});
    });
  });

  describe('exchangeLongLivedUserToken', () => {
    it('đổi expires_in thành mốc thời gian tuyệt đối', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-26T10:00:00.000Z'));
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          access_token: 'long-tok',
          // 60 ngày — giá trị Meta thực sự trả cho token dài hạn.
          expires_in: 5_184_000,
        }),
      );

      const result = await client.exchangeLongLivedUserToken('short-tok', APP);

      expect(result.token).toBe('long-tok');
      expect(result.expiresAt).toEqual(new Date('2026-09-24T10:00:00.000Z'));
      expect(fetchMock.mock.calls[0][0]).toContain(
        'grant_type=fb_exchange_token',
      );
      jest.useRealTimers();
    });

    it('không có expires_in ⇒ token không hết hạn', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { access_token: 'long-tok' }),
      );

      const result = await client.exchangeLongLivedUserToken('short-tok', APP);

      expect(result.expiresAt).toBeNull();
    });

    it('Meta trả lỗi ⇒ FacebookGraphError, không ném lỗi HTTP thô', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(400, {
          error: { message: 'Invalid verification code', code: 100 },
        }),
      );

      await expect(
        client.exchangeLongLivedUserToken('short-tok', APP),
      ).rejects.toThrow(FacebookGraphError);
    });

    it('response thiếu access_token ⇒ báo lỗi cấu hình app', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}));

      await expect(
        client.exchangeLongLivedUserToken('short-tok', APP),
      ).rejects.toThrow(/App ID \/ App Secret \/ Redirect URI/);
    });
  });

  describe('listPagesWithTokens', () => {
    it('trả page kèm token + tasks, và gắn appsecret_proof khi có app secret', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          data: [
            {
              id: 'p1',
              name: 'Luca',
              category: 'Coffee shop',
              access_token: 'page-tok',
              tasks: ['CREATE_CONTENT', 'MANAGE'],
            },
          ],
        }),
      );

      const result = await client.listPagesWithTokens('user-tok', 'app-secret');

      expect(result).toEqual([
        {
          id: 'p1',
          name: 'Luca',
          category: 'Coffee shop',
          accessToken: 'page-tok',
          tasks: ['CREATE_CONTENT', 'MANAGE'],
        },
      ]);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toContain('appsecret_proof=');
      expect(url).not.toContain('user-tok');
      expect(init.headers).toEqual({ Authorization: 'Bearer user-tok' });
    });

    it('bỏ qua page không có access_token — nhập vào cũng vô dụng', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { data: [{ id: 'p1', name: 'Luca' }] }),
      );

      const result = await client.listPagesWithTokens('user-tok');

      expect(result).toEqual([]);
    });

    it('không có app secret ⇒ không gắn appsecret_proof', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

      await client.listPagesWithTokens('user-tok');

      expect(fetchMock.mock.calls[0][0]).not.toContain('appsecret_proof');
    });
  });

  describe('getMe', () => {
    it('trả id + name của tài khoản', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, { id: 'u1', name: 'Hiệp Trần' }),
      );

      expect(await client.getMe('user-tok')).toEqual({
        id: 'u1',
        name: 'Hiệp Trần',
      });
    });

    it('thiếu id ⇒ FacebookGraphError', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { name: 'Hiệp' }));

      await expect(client.getMe('user-tok')).rejects.toThrow(
        FacebookGraphError,
      );
    });
  });
});
