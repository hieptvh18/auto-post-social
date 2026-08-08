import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type {
  FacebookConnection,
  FacebookPage,
} from '../../../generated/prisma/client';
import { FacebookConnectMode } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { buildFacebookRedirectUri } from '../../common/utils/facebook-redirect.util';
import { AppConfigService } from '../../config/app-config.service';
import { ClockService } from '../../infra/clock/clock.service';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { FacebookGraphClient } from '../../infra/facebook/facebook-graph.client';
import type { FacebookPageWithToken } from '../../infra/facebook/facebook-graph.interface';
import { AuditAction, AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import {
  toFacebookConnectionResponse,
  type FacebookConnectionResponse,
} from './facebook-connection.mapper';
import { FacebookConnectionsRepository } from './facebook-connections.repository';
import {
  toFacebookPageResponse,
  type FacebookPageResponse,
} from './facebook-page.mapper';
import { FacebookPagesRepository } from './facebook-pages.repository';
import type { ImportPagesDto } from './dto/import-pages.dto';
import { maskToken } from '../../common/utils/token-mask.util';

/** Quyền tối thiểu để bot đăng bài — xin đủ ngay lần đầu, tránh phải consent 2 lần. */
const OAUTH_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  // Đọc `/insights` của bài đã đăng (plan 25). `pages_read_engagement` chỉ cho
  // đọc NỘI DUNG bài, không mở được edge insights.
  //
  // CẢNH BÁO: token đã cấp giữ nguyên scope cũ VĨNH VIỄN. Mọi kết nối tạo trước
  // plan 25 sẽ không có quyền này và không tự nâng cấp — user phải bấm "Kết nối
  // lại". Cờ `canReadInsights` trên response page tồn tại để UI nói ra điều đó.
  'read_insights',
];

/** Task Meta trả trong `/me/accounts` — có nó mới thực sự đăng bài được. */
const TASK_CREATE_CONTENT = 'CREATE_CONTENT';

/** State sống ngắn: đủ để user bấm xong consent, không đủ để bị lợi dụng. */
const STATE_TTL_MS = 10 * 60 * 1000;

interface PendingState {
  actorId: string;
  expiresAt: number;
}

/** Một page mà tài khoản Facebook nhìn thấy, kèm trạng thái phía hệ thống. */
export interface FacebookPageCandidate {
  pageId: string;
  pageName: string | null;
  category: string | null;
  /** Tài khoản có task CREATE_CONTENT trên page này hay không. */
  canPost: boolean;
  /** Page đã có trong hệ thống (kể cả đang tạm dừng). */
  alreadyAdded: boolean;
  /** Nguồn token hiện tại của page đã có — null nếu chưa có trong hệ thống. */
  currentConnectMode: FacebookConnectMode | null;
  /** false ⇒ UI khoá dòng lại, lý do ở `blockedReason`. */
  importable: boolean;
  blockedReason: string | null;
}

/** Kết quả import — tách 3 nhóm để UI nói đúng chuyện gì đã xảy ra. */
export interface ImportPagesResult {
  imported: FacebookPageResponse[];
  /** Page bị bỏ qua kèm lý do (không đăng bài được, không thấy trong tài khoản...). */
  skipped: { pageId: string; reason: string }[];
  /** Page đang dùng token dán tay — chờ user xác nhận mới ghi đè. */
  needsConfirm: { pageId: string; pageName: string }[];
}

/**
 * Luồng "Đăng nhập bằng Facebook" (plan 15).
 *
 * Lý do tồn tại: user chỉ được **share quyền** trên Page doanh nghiệp, không cầm
 * System User. Page token dẫn xuất từ user token **đã đổi sang bản dài hạn** thì
 * không có hạn dùng (`expires_at = 0`) — gần tương đương System User.
 *
 * Bỏ bước đổi dài hạn ⇒ Page token cũng chỉ sống vài giờ, và mọi thứ vẫn xanh cho
 * tới khi bot chết lặng. Đó là lỗi đắt nhất có thể mắc ở file này.
 */
@Injectable()
export class FacebookConnectService {
  private readonly logger = new Logger('FacebookConnect');
  /** State single-use, giống DriveOAuthService — mất khi restart là chấp nhận được. */
  private readonly pending = new Map<string, PendingState>();

  constructor(
    private readonly connections: FacebookConnectionsRepository,
    private readonly pages: FacebookPagesRepository,
    private readonly crypto: CryptoService,
    private readonly graph: FacebookGraphClient,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  // ─────────────────────────────── OAuth ───────────────────────────────

  /** URL dialog đăng nhập Facebook. Tạo `state` gắn với người bấm nút. */
  async buildAuthUrl(actorId: string): Promise<string> {
    const app = await this.settings.getFacebookAppCredentials();
    const state = randomBytes(24).toString('hex');
    this.sweep();
    this.pending.set(state, {
      actorId,
      expiresAt: this.clock.now().getTime() + STATE_TTL_MS,
    });

    const params = new URLSearchParams({
      client_id: app.appId,
      redirect_uri: this.redirectUri(),
      state,
      response_type: 'code',
      scope: OAUTH_SCOPES.join(','),
    });

    return `https://www.facebook.com/${this.config.facebook.graphVersion}/dialog/oauth?${params.toString()}`;
  }

  /**
   * Đổi `code` → token ngắn hạn → **token dài hạn** → lưu kết nối (mã hoá).
   * Trả về id kết nối để controller redirect kèm, UI mở luôn modal chọn page.
   */
  async handleCallback(code: string, state: string): Promise<string> {
    const pending = this.pending.get(state);
    this.pending.delete(state);
    if (
      pending === undefined ||
      pending.expiresAt < this.clock.now().getTime()
    ) {
      throw new BadRequestException(
        'Phiên kết nối Facebook không hợp lệ hoặc đã hết hạn. Bấm "Kết nối bằng Facebook" lại.',
      );
    }

    const app = await this.settings.getFacebookAppCredentials();

    const shortLived = await this.graph.exchangeCodeForUserToken(
      code,
      this.redirectUri(),
      app,
    );
    const longLived = await this.graph.exchangeLongLivedUserToken(
      shortLived.token,
      app,
    );

    const [profile, tokenInfo] = await Promise.all([
      this.graph.getMe(longLived.token, app.appSecret),
      this.graph.debugToken(longLived.token),
    ]);

    const connection = await this.connections.upsertByFbUserId({
      fbUserId: profile.id,
      fbUserName: profile.name,
      userTokenEnc: this.crypto.encrypt(longLived.token),
      // Ưu tiên hạn từ debug_token (chính xác hơn `expires_in` cộng dồn phía client).
      tokenExpireAt: tokenInfo.expiresAt ?? longLived.expiresAt,
      scopes: tokenInfo.scopes,
      connectedById: pending.actorId,
    });

    await this.audit.log({
      userId: pending.actorId,
      action: AuditAction.PAGE_CONNECT_FB,
      resource: `facebook_connection:${connection.id}`,
      afterValue: { fbUserId: profile.id, fbUserName: profile.name },
    });

    this.logger.log(
      `Đã kết nối tài khoản Facebook ${profile.name ?? profile.id} (connection ${connection.id})`,
    );
    return connection.id;
  }

  // ────────────────────────────── Kết nối ──────────────────────────────

  async listConnections(): Promise<FacebookConnectionResponse[]> {
    const rows = await this.connections.findMany();
    const now = this.clock.now();
    return rows.map((row) => toFacebookConnectionResponse(row, now));
  }

  /**
   * Ngắt kết nối: xoá user token đã lưu. **Không** đụng tới token của page đang
   * chạy — chúng là Page token riêng, vẫn đăng bài được bình thường.
   */
  async revoke(id: string, actor: AuthenticatedUser): Promise<void> {
    const connection = await this.getConnectionOrFail(id);
    await this.connections.revoke(id);

    await this.audit.log({
      userId: actor.id,
      action: AuditAction.PAGE_CONNECT_REVOKE,
      resource: `facebook_connection:${id}`,
      beforeValue: {
        fbUserId: connection.fbUserId,
        fbUserName: connection.fbUserName,
      },
    });
  }

  // ─────────────────────────────── Page ───────────────────────────────

  /** Danh sách page của tài khoản, kèm lý do vì sao page nào đó không nhập được. */
  async listCandidates(connectionId: string): Promise<FacebookPageCandidate[]> {
    const remote = await this.fetchRemotePages(connectionId);
    if (remote.length === 0) return [];

    const existing = await this.pages.findManyByPageIds(
      remote.map((page) => page.id),
    );
    const byPageId = new Map(existing.map((page) => [page.pageId, page]));

    return remote.map((page) => {
      const current = byPageId.get(page.id) ?? null;
      const canPost = page.tasks.includes(TASK_CREATE_CONTENT);
      // Page đã xoá mềm coi như chưa có — import sẽ hồi sinh nó.
      const alreadyAdded = current !== null && current.deletedAt === null;

      return {
        pageId: page.id,
        pageName: page.name,
        category: page.category,
        canPost,
        alreadyAdded,
        currentConnectMode: alreadyAdded ? current.connectMode : null,
        importable: canPost,
        blockedReason: canPost
          ? null
          : 'Tài khoản Facebook của bạn không có quyền tạo nội dung trên page này. ' +
            'Nhờ admin của page cấp quyền "Tạo bài viết" rồi kết nối lại.',
      };
    });
  }

  /**
   * Nhập page vào hệ thống. Năm nhánh ở plan 15 §3.6 — thứ tự kiểm tra quan trọng:
   * quyền trước, rồi mới tới trạng thái page trong DB.
   */
  async importPages(
    connectionId: string,
    dto: ImportPagesDto,
    actor: AuthenticatedUser,
  ): Promise<ImportPagesResult> {
    const connection = await this.getConnectionOrFail(connectionId);
    const remote = await this.fetchRemotePages(connectionId);
    const byPageId = new Map(remote.map((page) => [page.id, page]));

    const result: ImportPagesResult = {
      imported: [],
      skipped: [],
      needsConfirm: [],
    };

    for (const pageId of dto.pageIds) {
      const source = byPageId.get(pageId);

      if (source === undefined) {
        result.skipped.push({
          pageId,
          reason:
            'Tài khoản Facebook này không còn thấy page đó. Kết nối lại rồi thử lại.',
        });
        continue;
      }

      if (!source.tasks.includes(TASK_CREATE_CONTENT)) {
        result.skipped.push({
          pageId,
          reason:
            'Không có quyền tạo nội dung trên page này — nhập vào cũng không đăng được.',
        });
        continue;
      }

      const existing = await this.pages.findByPageId(pageId);

      // Page dán tay đang sống: KHÔNG tự ghi đè. Token System User đang chạy tốt
      // mà bị thay bằng token cá nhân là hạ độ bền — phải để user quyết.
      if (
        existing !== null &&
        existing.deletedAt === null &&
        existing.connectMode === FacebookConnectMode.MANUAL_TOKEN &&
        dto.overwriteManual !== true
      ) {
        result.needsConfirm.push({
          pageId,
          pageName: existing.pageName,
        });
        continue;
      }

      const saved =
        existing === null
          ? await this.createFromRemote(source, connection, actor)
          : await this.updateFromRemote(existing, source, connection, actor);

      result.imported.push(
        toFacebookPageResponse(saved, maskToken(source.accessToken)),
      );
    }

    return result;
  }

  /**
   * Lấy lại Page token cho một page đã lưu (nút "Lấy lại token").
   * Chỉ page nguồn FB_LOGIN mới làm được — page dán tay không có gì để tạo lại.
   */
  async refreshPageToken(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<FacebookPageResponse> {
    const page = await this.pages.findById(id);
    if (page === null) {
      throw new NotFoundException('Không tìm thấy Facebook Page');
    }
    if (page.connectionId === null) {
      throw new BadRequestException(
        'Page này dùng token dán tay nên không lấy lại token tự động được. ' +
          'Hãy nhập token mới, hoặc kết nối lại bằng đăng nhập Facebook.',
      );
    }

    const remote = await this.fetchRemotePages(page.connectionId);
    const source = remote.find((item) => item.id === page.pageId);
    if (source === undefined) {
      throw new BadRequestException(
        'Tài khoản Facebook đã kết nối không còn thấy page này — có thể bạn đã bị gỡ quyền khỏi Page.',
      );
    }

    const updated = await this.pages.update(page.id, {
      accessTokenEnc: this.crypto.encrypt(source.accessToken),
      tokenExpireAt: null,
      pageName: source.name ?? page.pageName,
    });

    await this.audit.log({
      userId: actor.id,
      action: AuditAction.PAGE_TOKEN_UPDATE,
      resource: `facebook_page:${page.id}`,
      afterValue: { source: 'FB_LOGIN', connectionId: page.connectionId },
    });

    return toFacebookPageResponse(updated, maskToken(source.accessToken));
  }

  // ────────────────────────────── Nội bộ ──────────────────────────────

  private async createFromRemote(
    source: FacebookPageWithToken,
    connection: FacebookConnection,
    actor: AuthenticatedUser,
  ): Promise<FacebookPage> {
    const created = await this.pages.create({
      pageName: source.name ?? source.id,
      pageId: source.id,
      accessTokenEnc: this.crypto.encrypt(source.accessToken),
      createdById: actor.id,
      connectMode: FacebookConnectMode.FB_LOGIN,
      connectionId: connection.id,
    });

    await this.audit.log({
      userId: actor.id,
      action: AuditAction.PAGE_CREATE,
      resource: `facebook_page:${created.id}`,
      afterValue: {
        pageName: created.pageName,
        pageId: created.pageId,
        connectMode: FacebookConnectMode.FB_LOGIN,
      },
    });
    return created;
  }

  /** Dùng cho cả hồi sinh page đã xoá lẫn ghi đè token page đang có. */
  private async updateFromRemote(
    existing: FacebookPage,
    source: FacebookPageWithToken,
    connection: FacebookConnection,
    actor: AuthenticatedUser,
  ): Promise<FacebookPage> {
    const revived = existing.deletedAt !== null;

    const updated = await this.pages.update(existing.id, {
      pageName: source.name ?? existing.pageName,
      accessTokenEnc: this.crypto.encrypt(source.accessToken),
      // Page token lấy từ user token dài hạn thì không có hạn — xoá hạn cũ đi.
      tokenExpireAt: null,
      connectMode: FacebookConnectMode.FB_LOGIN,
      connectionId: connection.id,
      ...(revived ? { deletedAt: null, isActive: true } : {}),
    });

    await this.audit.log({
      userId: actor.id,
      action: revived ? AuditAction.PAGE_CREATE : AuditAction.PAGE_TOKEN_UPDATE,
      resource: `facebook_page:${updated.id}`,
      afterValue: {
        pageName: updated.pageName,
        pageId: updated.pageId,
        connectMode: FacebookConnectMode.FB_LOGIN,
        revived,
      },
    });
    return updated;
  }

  /** Giải mã user token của kết nối rồi hỏi Meta danh sách page + Page token. */
  private async fetchRemotePages(
    connectionId: string,
  ): Promise<FacebookPageWithToken[]> {
    const connection = await this.getConnectionOrFail(connectionId);
    const app = await this.settings.getFacebookAppCredentials();
    const userToken = this.decryptUserToken(connection);
    return this.graph.listPagesWithTokens(userToken, app.appSecret);
  }

  private decryptUserToken(connection: FacebookConnection): string {
    if (connection.userTokenEnc === null) {
      throw new BadRequestException(
        'Kết nối này đã bị ngắt. Bấm "Kết nối bằng Facebook" để đăng nhập lại.',
      );
    }
    try {
      return this.crypto.decrypt(connection.userTokenEnc);
    } catch {
      // Đổi TOKEN_ENCRYPTION_KEY ⇒ token cũ thành rác. Nói thẳng cách khắc phục.
      throw new BadRequestException(
        'Không giải mã được token đã lưu (khoá mã hoá đã thay đổi). Hãy kết nối lại bằng đăng nhập Facebook.',
      );
    }
  }

  private async getConnectionOrFail(id: string): Promise<FacebookConnection> {
    const connection = await this.connections.findById(id);
    if (connection === null || connection.revokedAt !== null) {
      throw new NotFoundException('Không tìm thấy kết nối Facebook');
    }
    return connection;
  }

  private redirectUri(): string {
    return buildFacebookRedirectUri(
      this.config.appBaseUrl,
      this.config.apiPrefix,
    );
  }

  private sweep(): void {
    const now = this.clock.now().getTime();
    for (const [key, value] of this.pending) {
      if (value.expiresAt < now) this.pending.delete(key);
    }
  }
}
