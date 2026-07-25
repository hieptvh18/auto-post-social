import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FacebookPage } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  maskToken,
  UNKNOWN_TOKEN_MASK,
} from '../../common/utils/token-mask.util';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { FacebookGraphClient } from '../../infra/facebook/facebook-graph.client';
import type { FacebookTokenType } from '../../infra/facebook/facebook-graph.interface';
import { FacebookGraphError } from '../../infra/facebook/facebook.errors';
import { AuditAction, AuditService } from '../audit/audit.service';
import {
  toFacebookPageResponse,
  type FacebookPageResponse,
} from './facebook-page.mapper';
import { FacebookPagesRepository } from './facebook-pages.repository';
import type { CreateFacebookPageDto } from './dto/create-facebook-page.dto';
import type { UpdateFacebookPageDto } from './dto/update-facebook-page.dto';

/** Scope tối thiểu để bot đăng bài lên page. */
const SCOPE_MANAGE_POSTS = 'pages_manage_posts';
/** Dưới ngưỡng này thì cảnh báo token sắp hết hạn (bot sẽ chết giữa chừng). */
const EXPIRY_WARNING_DAYS = 7;
const MS_PER_DAY = 86_400_000;

/** Kết quả nút "Test kết nối" — luôn 200, sai cấu hình thì `ok:false` kèm lý do. */
export interface FacebookConnectionResult {
  ok: boolean;
  pageId: string;
  pageName: string | null;
  category: string | null;
  /** Token có scope `pages_manage_posts` hay không. */
  canPost: boolean;
  tokenType: FacebookTokenType;
  /** `null` = token vĩnh viễn (System User) — trạng thái lý tưởng cho bot. */
  expiresAt: Date | null;
  message: string;
}

@Injectable()
export class FacebookPagesService {
  constructor(
    private readonly repository: FacebookPagesRepository,
    private readonly crypto: CryptoService,
    private readonly auditService: AuditService,
    private readonly graph: FacebookGraphClient,
  ) {}

  async findAll(): Promise<FacebookPageResponse[]> {
    const pages = await this.repository.findMany();
    return pages.map((page) => this.toResponse(page));
  }

  async create(
    dto: CreateFacebookPageDto,
    actor: AuthenticatedUser,
  ): Promise<FacebookPageResponse> {
    const existing = await this.repository.findByPageId(dto.pageId);
    if (existing !== null && existing.deletedAt === null) {
      throw new ConflictException('Page ID này đã được thêm vào hệ thống');
    }

    // Page cũ đã xoá mềm: hồi sinh chính dòng đó — UNIQUE `page_id` chặn tạo dòng mới.
    if (existing !== null) {
      return this.revive(existing, dto, actor);
    }

    const created = await this.repository.create({
      pageName: dto.pageName,
      pageId: dto.pageId,
      accessTokenEnc: this.crypto.encrypt(dto.accessToken),
      tokenExpireAt: dto.tokenExpireAt
        ? new Date(dto.tokenExpireAt)
        : undefined,
      createdById: actor.id,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.PAGE_CREATE,
      resource: `facebook_page:${created.id}`,
      afterValue: { pageName: created.pageName, pageId: created.pageId },
    });

    return this.toResponse(created, dto.accessToken);
  }

  async update(
    id: string,
    dto: UpdateFacebookPageDto,
    actor: AuthenticatedUser,
  ): Promise<FacebookPageResponse> {
    const current = await this.getOrFail(id);
    const tokenChanged = dto.accessToken !== undefined;

    const updated = await this.repository.update(id, {
      pageName: dto.pageName,
      accessTokenEnc: tokenChanged
        ? this.crypto.encrypt(dto.accessToken as string)
        : undefined,
      tokenExpireAt:
        dto.tokenExpireAt === undefined
          ? undefined
          : new Date(dto.tokenExpireAt),
      autopostEnabled: dto.autopostEnabled,
      isActive: dto.isActive,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.PAGE_UPDATE,
      resource: `facebook_page:${id}`,
      beforeValue: { pageName: current.pageName, isActive: current.isActive },
      afterValue: { pageName: updated.pageName, isActive: updated.isActive },
    });

    if (tokenChanged) {
      await this.auditService.log({
        userId: actor.id,
        action: AuditAction.PAGE_TOKEN_UPDATE,
        resource: `facebook_page:${id}`,
      });
    }

    return this.toResponse(updated, tokenChanged ? dto.accessToken : undefined);
  }

  /**
   * DELETE = soft delete vì `publish_jobs` tham chiếu tới page (giữ lịch sử đăng).
   * Dấu xoá là `deletedAt`, **không** phải `isActive` — `isActive=false` chỉ nghĩa
   * "tạm dừng" và page tạm dừng vẫn phải hiện trên UI.
   */
  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const current = await this.getOrFail(id);
    await this.repository.update(id, {
      deletedAt: new Date(),
      isActive: false,
      autopostEnabled: false,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.PAGE_DELETE,
      resource: `facebook_page:${id}`,
      beforeValue: { pageName: current.pageName, pageId: current.pageId },
    });
  }

  /** Thêm lại page đã xoá: ghi đè bằng dữ liệu mới và bỏ dấu xoá. */
  private async revive(
    existing: FacebookPage,
    dto: CreateFacebookPageDto,
    actor: AuthenticatedUser,
  ): Promise<FacebookPageResponse> {
    const revived = await this.repository.update(existing.id, {
      pageName: dto.pageName,
      accessTokenEnc: this.crypto.encrypt(dto.accessToken),
      tokenExpireAt: dto.tokenExpireAt ? new Date(dto.tokenExpireAt) : null,
      isActive: true,
      deletedAt: null,
      createdById: actor.id,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.PAGE_CREATE,
      resource: `facebook_page:${revived.id}`,
      afterValue: {
        pageName: revived.pageName,
        pageId: revived.pageId,
        revived: true,
      },
    });

    return this.toResponse(revived, dto.accessToken);
  }

  /**
   * Test cấu hình **chưa lưu** (form thêm page / vừa nhập token mới).
   * Không ghi gì vào DB — chỉ gọi thử Graph API.
   */
  testConnection(
    pageId: string,
    accessToken: string,
  ): Promise<FacebookConnectionResult> {
    return this.probe(pageId, accessToken);
  }

  /** Test page **đã lưu** bằng token trong DB — dùng khi sửa mà không đổi token. */
  async testSavedPageConnection(id: string): Promise<FacebookConnectionResult> {
    const page = await this.getOrFail(id);

    let token: string;
    try {
      token = this.crypto.decrypt(page.accessTokenEnc);
    } catch {
      // Đổi TOKEN_ENCRYPTION_KEY ⇒ token cũ thành rác. Nói thẳng cách khắc phục.
      return {
        ok: false,
        pageId: page.pageId,
        pageName: page.pageName,
        category: null,
        canPost: false,
        tokenType: 'UNKNOWN',
        expiresAt: null,
        message:
          'Không giải mã được token đã lưu (khoá mã hoá đã thay đổi). Hãy nhập lại access token mới.',
      };
    }

    return this.probe(page.pageId, token);
  }

  /**
   * Gọi Graph và diễn giải kết quả. Lỗi Graph ⇒ `ok:false` chứ **không** ném exception:
   * đây là nút kiểm tra cấu hình, user cần đọc được lý do ngay trên form.
   */
  private async probe(
    pageId: string,
    accessToken: string,
  ): Promise<FacebookConnectionResult> {
    try {
      // Soi token TRƯỚC khi gọi page node: token sai page sẽ khiến lời gọi page
      // trả (#10)/(#100) rất khó hiểu, còn debug_token thì luôn chạy được.
      const token = await this.graph.debugToken(accessToken);
      const base = {
        pageId,
        pageName: null,
        category: null,
        canPost: false,
        tokenType: token.type,
        expiresAt: token.expiresAt,
      };

      if (!token.isValid) {
        return {
          ...base,
          ok: false,
          message:
            'Token đã hết hạn hoặc bị thu hồi. Hãy tạo token mới rồi dán lại.',
        };
      }

      if (
        token.type === 'PAGE' &&
        token.profileId !== null &&
        token.profileId !== pageId
      ) {
        return {
          ...base,
          ok: false,
          message:
            `Token này là Page token của page ${token.profileId}, không phải page ${pageId}. ` +
            'Sửa lại Facebook Page ID cho khớp, hoặc dán token của đúng page (lấy ở /me/accounts).',
        };
      }

      if (token.type !== 'PAGE') {
        return {
          ...base,
          ok: false,
          message: await this.explainNonPageToken(
            pageId,
            accessToken,
            token.type,
          ),
        };
      }

      const page = await this.graph.getPage(pageId, accessToken);
      const canPost = token.scopes.includes(SCOPE_MANAGE_POSTS);
      const name = page.name ?? pageId;

      if (!canPost) {
        return {
          ...base,
          ok: false,
          pageName: page.name,
          category: page.category,
          message:
            `Đọc được page "${name}" nhưng token thiếu scope ${SCOPE_MANAGE_POSTS} nên không đăng bài được. ` +
            'Thêm quyền này cho app rồi tạo lại token.',
        };
      }

      return {
        ...base,
        ok: true,
        pageName: page.name,
        category: page.category,
        canPost: true,
        message: `Kết nối thành công tới page "${name}". Token đăng bài được.${this.expiryNote(
          token.expiresAt,
        )}`,
      };
    } catch (error) {
      if (error instanceof FacebookGraphError) {
        return {
          ok: false,
          pageId,
          pageName: null,
          category: null,
          canPost: false,
          tokenType: 'UNKNOWN',
          expiresAt: null,
          message: error.message,
        };
      }
      throw error;
    }
  }

  /**
   * Token USER/SYSTEM_USER không đăng bài được, nhưng lý do "vì sao" mới là thứ
   * user cần: hỏi `/me/accounts` để phân biệt **chưa được gán Page** (danh sách rỗng)
   * với **chỉ thiếu bước đổi sang Page token** (page có trong danh sách).
   */
  private async explainNonPageToken(
    pageId: string,
    accessToken: string,
    type: FacebookTokenType,
  ): Promise<string> {
    const prefix = `Đây là token loại ${type}, không phải Page Access Token.`;

    let pages: { id: string; name: string | null }[];
    try {
      pages = await this.graph.listPages(accessToken);
    } catch {
      // Không liệt kê được thì vẫn phải trả lời được câu "làm gì tiếp theo".
      return `${prefix} Hãy gọi GET /me/accounts rồi copy field access_token của page cần dùng.`;
    }

    if (pages.length === 0) {
      return (
        `${prefix} Tài khoản của token này chưa được gán Page nào — đó mới là lý do không đọc được page. ` +
        'Vào Business settings → Users → (System) users → chọn tài khoản → Add assets → Pages → ' +
        'chọn page rồi bật quyền "Manage Page"/"Tạo nội dung", sau đó tạo lại token.'
      );
    }

    const target = pages.find((page) => page.id === pageId);
    if (target === undefined) {
      const list = pages.map((p) => `${p.name ?? '?'} (${p.id})`).join(', ');
      return (
        `${prefix} Token này thấy được các page: ${list} — không có page ${pageId}. ` +
        'Kiểm tra lại Page ID, hoặc gán thêm page đó cho tài khoản trong Business settings.'
      );
    }

    return (
      `${prefix} Token thấy được page "${target.name ?? pageId}", chỉ còn thiếu bước đổi sang Page token: ` +
      'gọi GET /me/accounts?fields=id,name,access_token rồi copy field access_token của page này.'
    );
  }

  /**
   * Token ngắn hạn là cái bẫy lớn nhất của bot đăng bài: test xanh hôm nay,
   * chết lặng vài giờ sau. Nên nói thẳng hạn dùng ngay lúc test.
   */
  private expiryNote(expiresAt: Date | null): string {
    if (expiresAt === null) {
      return ' Token không có hạn dùng (System User) — tốt nhất cho bot chạy nền.';
    }

    const days = Math.floor((expiresAt.getTime() - Date.now()) / MS_PER_DAY);
    if (days <= EXPIRY_WARNING_DAYS) {
      return (
        ` ⚠️ CẢNH BÁO: token hết hạn sau ${days} ngày (${expiresAt.toISOString()}) — bot sẽ ngừng đăng khi đó. ` +
        'Nên thay bằng token System User (không hết hạn).'
      );
    }
    return ` Token hết hạn ngày ${expiresAt.toISOString().slice(0, 10)}.`;
  }

  /** Lối vào duy nhất lấy token plaintext — chỉ publisher gọi. */
  async getDecryptedToken(id: string): Promise<string> {
    const page = await this.getOrFail(id);
    if (!page.isActive) {
      throw new NotFoundException(
        'Page đã ngừng hoạt động, không thể lấy token',
      );
    }
    return this.crypto.decrypt(page.accessTokenEnc);
  }

  private async getOrFail(id: string): Promise<FacebookPage> {
    const page = await this.repository.findById(id);
    if (page === null) {
      throw new NotFoundException('Không tìm thấy Facebook Page');
    }
    return page;
  }

  /**
   * `knownPlainToken` tránh phải decrypt lại ngay sau khi vừa encrypt (create/update).
   * Khi không có, decrypt entity để tính mask — lỗi (đổi TOKEN_ENCRYPTION_KEY) thì
   * vẫn trả list được, chỉ hiện mask "chưa xác định" thay vì crash cả danh sách.
   */
  private toResponse(
    page: FacebookPage,
    knownPlainToken?: string,
  ): FacebookPageResponse {
    if (knownPlainToken !== undefined) {
      return toFacebookPageResponse(page, maskToken(knownPlainToken));
    }

    try {
      return toFacebookPageResponse(
        page,
        maskToken(this.crypto.decrypt(page.accessTokenEnc)),
      );
    } catch {
      return toFacebookPageResponse(page, UNKNOWN_TOKEN_MASK);
    }
  }
}
