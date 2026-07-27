import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service';
import type {
  FacebookAccountPage,
  FacebookAppCredentials,
  FacebookGraph,
  FacebookPageProbe,
  FacebookPageWithToken,
  FacebookTokenInfo,
  FacebookTokenType,
  FacebookUserProfile,
  FacebookUserToken,
} from './facebook-graph.interface';
import { FacebookGraphError, mapFacebookError } from './facebook.errors';

const GRAPH_BASE_URL = 'https://graph.facebook.com';
/** Test kết nối là thao tác đồng bộ trên UI — không để user chờ quá lâu. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Số page tối đa đọc trong 1 lần `/me/accounts` — quá số này thì Graph phân trang. */
const PAGE_LIST_LIMIT = 100;

@Injectable()
export class FacebookGraphClient implements FacebookGraph {
  private readonly logger = new Logger(FacebookGraphClient.name);

  constructor(private readonly config: AppConfigService) {}

  async getPage(
    pageId: string,
    accessToken: string,
  ): Promise<FacebookPageProbe> {
    const { graphVersion } = this.config.facebook;
    const url = `${GRAPH_BASE_URL}/${graphVersion}/${encodeURIComponent(
      pageId,
    )}?fields=id,name,category`;

    const body = await this.request(url, accessToken, 'đọc thông tin Page');
    return this.toProbe(body);
  }

  /**
   * `input_token` buộc phải nằm trên query string (Graph không nhận qua header),
   * nhưng token dùng để xác thực vẫn đi bằng header. Không log URL ở bất kỳ đâu.
   */
  async debugToken(accessToken: string): Promise<FacebookTokenInfo> {
    const { graphVersion } = this.config.facebook;
    const url = `${GRAPH_BASE_URL}/${graphVersion}/debug_token?input_token=${encodeURIComponent(
      accessToken,
    )}`;

    const body = await this.request(url, accessToken, 'kiểm tra access token');
    return this.toTokenInfo(body);
  }

  async listPages(accessToken: string): Promise<FacebookAccountPage[]> {
    const { graphVersion } = this.config.facebook;
    const url = `${GRAPH_BASE_URL}/${graphVersion}/me/accounts?fields=id,name`;

    const body = await this.request(url, accessToken, 'liệt kê Page của token');
    const data =
      body !== null && typeof body === 'object'
        ? (body as { data?: unknown }).data
        : null;

    if (!Array.isArray(data)) return [];

    return data.flatMap((item): FacebookAccountPage[] => {
      if (item === null || typeof item !== 'object') return [];
      const { id, name } = item as { id?: unknown; name?: unknown };
      if (typeof id !== 'string') return [];
      return [{ id, name: typeof name === 'string' ? name : null }];
    });
  }

  async exchangeCodeForUserToken(
    code: string,
    redirectUri: string,
    app: FacebookAppCredentials,
  ): Promise<FacebookUserToken> {
    const { graphVersion } = this.config.facebook;
    const params = new URLSearchParams({
      client_id: app.appId,
      client_secret: app.appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const body = await this.requestPublic(
      `${GRAPH_BASE_URL}/${graphVersion}/oauth/access_token?${params.toString()}`,
      'đổi mã đăng nhập lấy access token',
    );
    return this.toUserToken(body, 'đổi mã đăng nhập lấy access token');
  }

  async exchangeLongLivedUserToken(
    shortLivedToken: string,
    app: FacebookAppCredentials,
  ): Promise<FacebookUserToken> {
    const { graphVersion } = this.config.facebook;
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: app.appId,
      client_secret: app.appSecret,
      fb_exchange_token: shortLivedToken,
    });

    const body = await this.requestPublic(
      `${GRAPH_BASE_URL}/${graphVersion}/oauth/access_token?${params.toString()}`,
      'đổi sang access token dài hạn',
    );
    return this.toUserToken(body, 'đổi sang access token dài hạn');
  }

  async getMe(
    userToken: string,
    appSecret?: string,
  ): Promise<FacebookUserProfile> {
    const { graphVersion } = this.config.facebook;
    const url = this.withProof(
      `${GRAPH_BASE_URL}/${graphVersion}/me?fields=id,name`,
      userToken,
      appSecret,
    );

    const body = await this.request(url, userToken, 'đọc tài khoản Facebook');
    const raw =
      body !== null && typeof body === 'object'
        ? (body as { id?: unknown; name?: unknown })
        : {};

    if (typeof raw.id !== 'string') {
      throw new FacebookGraphError(
        'Facebook không trả về ID tài khoản — không xác định được bạn đã đăng nhập bằng tài khoản nào.',
      );
    }
    return {
      id: raw.id,
      name: typeof raw.name === 'string' ? raw.name : null,
    };
  }

  async listPagesWithTokens(
    userToken: string,
    appSecret?: string,
  ): Promise<FacebookPageWithToken[]> {
    const { graphVersion } = this.config.facebook;
    const url = this.withProof(
      `${GRAPH_BASE_URL}/${graphVersion}/me/accounts` +
        `?fields=id,name,category,access_token,tasks&limit=${PAGE_LIST_LIMIT}`,
      userToken,
      appSecret,
    );

    const body = await this.request(
      url,
      userToken,
      'lấy Page token của tài khoản',
    );
    const data =
      body !== null && typeof body === 'object'
        ? (body as { data?: unknown }).data
        : null;

    if (!Array.isArray(data)) return [];

    return data.flatMap((item): FacebookPageWithToken[] => {
      if (item === null || typeof item !== 'object') return [];
      const raw = item as {
        id?: unknown;
        name?: unknown;
        category?: unknown;
        access_token?: unknown;
        tasks?: unknown;
      };
      // Không có access_token thì page này vô dụng với bot — bỏ qua, đừng để lọt
      // xuống UI rồi import vào một page không đăng được.
      if (typeof raw.id !== 'string' || typeof raw.access_token !== 'string') {
        return [];
      }
      return [
        {
          id: raw.id,
          name: typeof raw.name === 'string' ? raw.name : null,
          category: typeof raw.category === 'string' ? raw.category : null,
          accessToken: raw.access_token,
          tasks: Array.isArray(raw.tasks)
            ? raw.tasks.filter((t): t is string => typeof t === 'string')
            : [],
        },
      ];
    });
  }

  /**
   * `appsecret_proof` = HMAC-SHA256 của access token với app secret. Meta yêu cầu
   * khi app bật "Require App Secret" — thiếu nó thì mọi lời gọi trả (#100).
   */
  private withProof(url: string, token: string, appSecret?: string): string {
    if (appSecret === undefined || appSecret === '') return url;
    const proof = createHmac('sha256', appSecret).update(token).digest('hex');
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}appsecret_proof=${proof}`;
  }

  /** Body của endpoint `/oauth/access_token`. `expires_in` = số giây còn lại. */
  private toUserToken(body: unknown, context: string): FacebookUserToken {
    const raw =
      body !== null && typeof body === 'object'
        ? (body as { access_token?: unknown; expires_in?: unknown })
        : {};

    if (typeof raw.access_token !== 'string' || raw.access_token === '') {
      throw new FacebookGraphError(
        `Facebook không trả về access token khi ${context}. Kiểm tra lại App ID / App Secret / Redirect URI.`,
      );
    }

    // Không có expires_in (hoặc = 0) nghĩa là token không hết hạn.
    const seconds =
      typeof raw.expires_in === 'number' && raw.expires_in > 0
        ? raw.expires_in
        : null;

    return {
      token: raw.access_token,
      expiresAt:
        seconds === null ? null : new Date(Date.now() + seconds * 1000),
    };
  }

  /**
   * Lời gọi **không** kèm Authorization: endpoint `/oauth/access_token` xác thực
   * bằng chính `client_secret` trên query string, gửi thêm header sẽ bị từ chối.
   */
  private async requestPublic(url: string, context: string): Promise<unknown> {
    return this.fetchJson(url, context, {});
  }

  /**
   * Token đi trong header `Authorization`, **không** trong query string — tránh
   * token lọt vào access log của proxy/Meta.
   */
  private async request(
    url: string,
    accessToken: string,
    context: string,
  ): Promise<unknown> {
    return this.fetchJson(url, context, {
      Authorization: `Bearer ${accessToken}`,
    });
  }

  private async fetchJson(
    url: string,
    context: string,
    headers: Record<string, string>,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Timeout / DNS / mất mạng — không có body Graph để map.
      this.logger.error(
        `Không gọi được Meta Graph khi ${context}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new FacebookGraphError(
        `Không kết nối được tới Facebook khi ${context}. Kiểm tra mạng của server rồi thử lại.`,
      );
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      mapFacebookError(body, context);
    }
    return body;
  }

  private toProbe(body: unknown): FacebookPageProbe {
    if (body === null || typeof body !== 'object') {
      throw new FacebookGraphError('Facebook trả về dữ liệu không đọc được.');
    }

    const raw = body as { id?: unknown; name?: unknown; category?: unknown };

    if (typeof raw.id !== 'string') {
      throw new FacebookGraphError(
        'Facebook không trả về ID của Page — cấu hình chưa đúng.',
      );
    }

    return {
      id: raw.id,
      name: typeof raw.name === 'string' ? raw.name : null,
      category: typeof raw.category === 'string' ? raw.category : null,
    };
  }

  private toTokenInfo(body: unknown): FacebookTokenInfo {
    const data =
      body !== null && typeof body === 'object'
        ? ((body as { data?: unknown }).data ?? {})
        : {};

    const raw = data as {
      type?: unknown;
      is_valid?: unknown;
      profile_id?: unknown;
      scopes?: unknown;
      expires_at?: unknown;
    };

    // SYSTEM_USER là loại Graph thực sự trả về cho token System User của Business —
    // thiếu nó trong danh sách thì token hợp lệ lại bị báo "UNKNOWN".
    const KNOWN_TYPES = ['PAGE', 'USER', 'SYSTEM_USER', 'APP'] as const;
    const type: FacebookTokenType = (KNOWN_TYPES as readonly string[]).includes(
      raw.type as string,
    )
      ? (raw.type as FacebookTokenType)
      : 'UNKNOWN';

    // expires_at = 0 nghĩa là token vĩnh viễn (System User) — không phải "hết hạn năm 1970".
    const expiresAtSec =
      typeof raw.expires_at === 'number' && raw.expires_at > 0
        ? raw.expires_at
        : null;

    return {
      type,
      isValid: raw.is_valid === true,
      profileId: typeof raw.profile_id === 'string' ? raw.profile_id : null,
      scopes: Array.isArray(raw.scopes)
        ? raw.scopes.filter((s): s is string => typeof s === 'string')
        : [],
      expiresAt: expiresAtSec === null ? null : new Date(expiresAtSec * 1000),
    };
  }
}
