import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentStatus, UserRole } from '../../../generated/prisma/client';
import { hasPermission } from '../../common/permissions';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { DriveStorageFactory } from '../../infra/drive/drive-storage.factory';
import { AuditAction, AuditService } from '../audit/audit.service';
import {
  toContentAssetResponse,
  type ContentAssetResponse,
} from './content-asset.mapper';
import {
  ContentAssetsRepository,
  type AssignmentDiff,
  type ContentAssetWithActors,
  type UpdateContentAssetData,
} from './content-assets.repository';
import { planStatusChange } from './content-status.transition';
import type { CreateContentAssetDto } from './dto/create-content-asset.dto';
import type { QueryContentAssetsDto } from './dto/query-content-assets.dto';
import type { UpdateContentAssetDto } from './dto/update-content-asset.dto';

export interface PaginatedContentAssets {
  data: ContentAssetResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Một hashtag đã dùng trong kho, kèm số bài đang dùng nó. */
export interface HashtagSuggestion {
  tag: string;
  count: number;
}

/** Một danh mục ("Dạng" bài) đang được dùng, kèm số bài. */
export interface CategorySuggestion {
  category: string;
  count: number;
}

/** Mã lỗi unique constraint của Prisma — dùng để đổi 500 thành 409. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class ContentAssetsService {
  constructor(
    private readonly repository: ContentAssetsRepository,
    private readonly driveFactory: DriveStorageFactory,
    private readonly auditService: AuditService,
  ) {}

  async findAll(
    query: QueryContentAssetsDto,
    actor: AuthenticatedUser,
  ): Promise<PaginatedContentAssets> {
    // CONTENT chỉ xem bài của mình — bỏ qua createdBy client gửi lên (rule 01 RBAC).
    const createdBy =
      actor.role === UserRole.CONTENT ? actor.id : query.createdBy;

    const { data, total } = await this.repository.findMany({
      mediaType: query.mediaType,
      category: query.category,
      status: query.status,
      isAds: query.isAds,
      search: query.search,
      createdBy,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: data.map(toContentAssetResponse),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ContentAssetResponse> {
    const asset = await this.getOrFail(id);
    this.assertOwnership(asset, actor);
    return toContentAssetResponse(asset);
  }

  /**
   * Gợi ý cho ô nhập nhanh hashtag trên UI: gom hashtag đã dùng trong kho, gộp
   * không phân biệt hoa/thường, xếp theo số bài dùng giảm dần. Không có bảng
   * hashtag riêng — nguồn sự thật vẫn là cột `content_assets.hashtags`.
   */
  async findHashtagSuggestions(): Promise<HashtagSuggestion[]> {
    const rawLines = await this.repository.findAllHashtagStrings();
    const counts = new Map<string, HashtagSuggestion>();

    for (const line of rawLines) {
      // Mỗi bài tính 1 lần cho mỗi tag, dù bài đó lặp lại tag nhiều lần.
      const tagsInAsset = new Set(splitHashtags(line));
      for (const tag of tagsInAsset) {
        const key = tag.toLowerCase();
        const entry = counts.get(key);
        if (entry === undefined) counts.set(key, { tag, count: 1 });
        else entry.count += 1;
      }
    }

    return [...counts.values()].sort(
      (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
    );
  }

  /**
   * Danh mục đang dùng trong kho, xếp theo số bài giảm dần. Danh mục **không**
   * có bảng riêng: người dùng gõ tên mới ở form là có danh mục mới, y như hashtag.
   * Gộp các biến thể chỉ khác hoa/thường hoặc khoảng trắng thừa để danh sách sạch.
   */
  async findCategorySuggestions(): Promise<CategorySuggestion[]> {
    const rows = await this.repository.findCategoryCounts();
    const merged = new Map<string, CategorySuggestion>();

    for (const row of rows) {
      const category = row.category.trim();
      if (category === '') continue;
      const key = category.toLowerCase();
      const entry = merged.get(key);
      if (entry === undefined) merged.set(key, { category, count: row.count });
      else entry.count += row.count;
    }

    return [...merged.values()].sort(
      (a, b) => b.count - a.count || a.category.localeCompare(b.category),
    );
  }

  async create(
    dto: CreateContentAssetDto,
    actor: AuthenticatedUser,
  ): Promise<ContentAssetResponse> {
    const assignedPageIds = dedupe(dto.assignedPageIds ?? []);
    await this.assertPagesExist(assignedPageIds);

    const created = await this.repository.create({
      title: dto.title,
      description: dto.description,
      caption: dto.caption,
      hashtags: dto.hashtags,
      // Trim để 'Thăm khám ' không đẻ ra danh mục thứ hai trong danh sách gợi ý.
      category: dto.category.trim(),
      mediaType: dto.mediaType,
      driveFileId: dto.driveFileId,
      driveUrl: dto.driveUrl,
      thumbnailUrl: dto.thumbnailUrl,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      createdById: actor.id,
      updatedById: actor.id,
      assignedPageIds,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.CONTENT_UPLOAD,
      resource: `content_asset:${created.id}`,
      afterValue: { title: created.title, driveFileId: created.driveFileId },
    });

    return toContentAssetResponse(created);
  }

  async update(
    id: string,
    dto: UpdateContentAssetDto,
    actor: AuthenticatedUser,
  ): Promise<ContentAssetResponse> {
    const current = await this.getOrFail(id);
    this.assertOwnership(current, actor);
    this.assertCanSetReviewFields(dto, actor);

    const data: UpdateContentAssetData = {
      title: dto.title,
      description: dto.description,
      category: dto.category?.trim(),
      caption: dto.caption,
      hashtags: dto.hashtags,
      updatedById: actor.id,
    };

    if (dto.isAds !== undefined) data.isAds = dto.isAds;

    if (dto.status !== undefined) {
      const change = planStatusChange({
        from: current.status,
        to: dto.status,
        actorId: actor.id,
        rejectComment: dto.rejectComment,
        currentRejectComment: current.rejectComment,
      });
      if (change !== null) Object.assign(data, change);
    } else if (dto.rejectComment !== undefined) {
      // Sửa lại lý do của bài đang bị từ chối mà không đổi trạng thái.
      data.rejectComment = dto.rejectComment;
    } else if (this.shouldResetToPendingReview(current, dto, actor)) {
      // docs/05 §3: người không có quyền duyệt sửa bài bị từ chối ⇒ về hàng chờ.
      data.status = ContentStatus.PENDING_REVIEW;
      data.rejectComment = null;
    }

    const assignments = await this.planAssignmentChange(current, dto);
    const updated = await this.runUpdate(id, data, assignments);
    await this.logUpdate(current, updated, actor, assignments);

    return toContentAssetResponse(updated);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const current = await this.getOrFail(id);
    this.assertOwnership(current, actor);

    const published = current.assignments.filter(
      (assignment) => assignment.publishedAt !== null,
    );
    if (published.length > 0) {
      throw new ConflictException(
        `Bài đã đăng trên ${published.length} page — không xoá được`,
      );
    }

    const storage = await this.driveFactory.get();
    await storage.delete(current.driveFileId);
    await this.repository.delete(id);

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.CONTENT_DELETE,
      resource: `content_asset:${id}`,
      beforeValue: { title: current.title, driveFileId: current.driveFileId },
    });
  }

  /** Gọi repository, đổi lỗi unique (P2002) thành 409 có nghĩa. */
  private async runUpdate(
    id: string,
    data: UpdateContentAssetData,
    assignments?: AssignmentDiff,
  ): Promise<ContentAssetWithActors> {
    try {
      return await this.repository.update(id, data, assignments);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Bài này đã được gán vào page đó rồi');
      }
      throw error;
    }
  }

  private async logUpdate(
    before: ContentAssetWithActors,
    after: ContentAssetWithActors,
    actor: AuthenticatedUser,
    assignments: AssignmentDiff | undefined,
  ): Promise<void> {
    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.CONTENT_UPDATE,
      resource: `content_asset:${after.id}`,
      beforeValue: { title: before.title, category: before.category },
      afterValue: { title: after.title, category: after.category },
    });

    if (before.status !== after.status) {
      await this.auditService.log({
        userId: actor.id,
        action: AuditAction.CONTENT_STATUS_CHANGE,
        resource: `content_asset:${after.id}`,
        beforeValue: { status: before.status },
        afterValue: {
          status: after.status,
          rejectComment: after.rejectComment,
        },
      });
    }

    if (before.isAds !== after.isAds) {
      await this.auditService.log({
        userId: actor.id,
        action: AuditAction.CONTENT_ADS_MARK,
        resource: `content_asset:${after.id}`,
        beforeValue: { isAds: before.isAds },
        afterValue: { isAds: after.isAds },
      });
    }

    const changedAssignment =
      assignments !== undefined &&
      (assignments.addPageIds.length > 0 ||
        assignments.removePageIds.length > 0);
    if (changedAssignment) {
      await this.auditService.log({
        userId: actor.id,
        action: AuditAction.CONTENT_ASSIGN_PAGE,
        resource: `content_asset:${after.id}`,
        afterValue: {
          added: assignments.addPageIds,
          removed: assignments.removePageIds,
        },
      });
    }
  }

  /**
   * Diff `assignedPageIds` với phân bổ hiện tại. Trả `undefined` khi client
   * không gửi field này (⇒ không đụng tới phân bổ).
   */
  private async planAssignmentChange(
    current: ContentAssetWithActors,
    dto: UpdateContentAssetDto,
  ): Promise<AssignmentDiff | undefined> {
    if (dto.assignedPageIds === undefined) return undefined;

    const requested = dedupe(dto.assignedPageIds);
    const currentPageIds = current.assignments.map(
      (assignment) => assignment.facebookPageId,
    );

    const removePageIds = currentPageIds.filter(
      (pageId) => !requested.includes(pageId),
    );
    const blocked = current.assignments.filter(
      (assignment) =>
        assignment.publishedAt !== null &&
        removePageIds.includes(assignment.facebookPageId),
    );
    if (blocked.length > 0) {
      throw new ConflictException(
        `Không gỡ được page đã đăng bài: ${blocked
          .map((assignment) => assignment.facebookPage.pageName)
          .join(', ')}`,
      );
    }

    const addPageIds = requested.filter(
      (pageId) => !currentPageIds.includes(pageId),
    );
    await this.assertPagesExist(addPageIds);

    return { addPageIds, removePageIds };
  }

  /** Page không tồn tại (hoặc đã xoá) là input sai ⇒ 400, không phải 404. */
  private async assertPagesExist(pageIds: string[]): Promise<void> {
    if (pageIds.length === 0) return;
    const existing = await this.repository.findExistingPageIds(pageIds);
    const missing = pageIds.filter((pageId) => !existing.includes(pageId));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Fanpage không tồn tại hoặc đã bị xoá: ${missing.join(', ')}`,
      );
    }
  }

  /** `status`/`isAds`/`rejectComment` là quyền duyệt — CONTENT chạm vào là 403. */
  private assertCanSetReviewFields(
    dto: UpdateContentAssetDto,
    actor: AuthenticatedUser,
  ): void {
    const touchesReviewFields =
      dto.status !== undefined ||
      dto.isAds !== undefined ||
      dto.rejectComment !== undefined;

    if (touchesReviewFields && !hasPermission(actor.role, 'content:review')) {
      throw new ForbiddenException(
        'Không có quyền duyệt bài hoặc đánh dấu Đạt ADS',
      );
    }
  }

  /** Người không có quyền duyệt sửa nội dung bài bị từ chối ⇒ đưa lại chờ duyệt. */
  private shouldResetToPendingReview(
    current: ContentAssetWithActors,
    dto: UpdateContentAssetDto,
    actor: AuthenticatedUser,
  ): boolean {
    if (current.status !== ContentStatus.REJECTED) return false;
    if (hasPermission(actor.role, 'content:review')) return false;
    return (
      dto.title !== undefined ||
      dto.description !== undefined ||
      dto.category !== undefined ||
      dto.caption !== undefined ||
      dto.hashtags !== undefined
    );
  }

  private async getOrFail(id: string): Promise<ContentAssetWithActors> {
    const asset = await this.repository.findById(id);
    if (asset === null) {
      throw new NotFoundException('Không tìm thấy content');
    }
    return asset;
  }

  /** CONTENT chỉ thao tác bài của chính mình; EDITOR/ADMIN thao tác mọi bài. */
  private assertOwnership(
    asset: ContentAssetWithActors,
    actor: AuthenticatedUser,
  ): void {
    if (actor.role === UserRole.CONTENT && asset.createdById !== actor.id) {
      throw new ForbiddenException('Chỉ thao tác được trên bài của chính mình');
    }
  }
}

/** '#a  #b' -> ['#a', '#b']; token thiếu '#' vẫn nhận và được thêm vào. */
function splitHashtags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token !== '' && token !== '#')
    .map((token) => (token.startsWith('#') ? token : `#${token}`));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === PRISMA_UNIQUE_VIOLATION
  );
}
