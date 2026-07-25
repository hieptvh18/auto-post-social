import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import type {
  FacebookAccountPage,
  FacebookGraph,
  FacebookPageProbe,
  FacebookTokenInfo,
  FacebookTokenType,
} from './facebook-graph.interface';
import { FacebookGraphError, mapFacebookError } from './facebook.errors';

const GRAPH_BASE_URL = 'https://graph.facebook.com';
/** Test kết nối là thao tác đồng bộ trên UI — không để user chờ quá lâu. */
const REQUEST_TIMEOUT_MS = 10_000;

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

  /**
   * Token đi trong header `Authorization`, **không** trong query string — tránh
   * token lọt vào access log của proxy/Meta.
   */
  private async request(
    url: string,
    accessToken: string,
    context: string,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
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
