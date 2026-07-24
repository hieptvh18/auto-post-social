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
import { AuditAction, AuditService } from '../audit/audit.service';
import {
  toFacebookPageResponse,
  type FacebookPageResponse,
} from './facebook-page.mapper';
import { FacebookPagesRepository } from './facebook-pages.repository';
import type { CreateFacebookPageDto } from './dto/create-facebook-page.dto';
import type { UpdateFacebookPageDto } from './dto/update-facebook-page.dto';

@Injectable()
export class FacebookPagesService {
  constructor(
    private readonly repository: FacebookPagesRepository,
    private readonly crypto: CryptoService,
    private readonly auditService: AuditService,
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
    if (existing !== null) {
      throw new ConflictException('Page ID này đã được thêm vào hệ thống');
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

  /** DELETE = soft delete (`isActive=false`) vì `publish_jobs` tham chiếu tới page. */
  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const current = await this.getOrFail(id);
    await this.repository.update(id, { isActive: false });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.PAGE_UPDATE,
      resource: `facebook_page:${id}`,
      beforeValue: { isActive: current.isActive },
      afterValue: { isActive: false },
    });
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
