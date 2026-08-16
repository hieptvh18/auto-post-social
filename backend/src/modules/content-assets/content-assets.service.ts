import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContentSource,
  ContentStatus,
  MediaType,
  UserRole,
} from '../../../generated/prisma/client';
import {
  BulkItemError,
  runBulkSequential,
  type BulkResult,
} from '../../common/bulk/bulk-result';
import { hasPermission, isAdminLevel } from '../../common/permissions';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { DriveStorageFactory } from '../../infra/drive/drive-storage.factory';
import { AuditAction, AuditService } from '../audit/audit.service';
import { UsersRepository } from '../users/users.repository';
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
import { MAX_IMAGES_PER_CONTENT_ASSET } from './content-assets.constants';
import { planStatusChange } from './content-status.transition';
import type {
  QueryContentAssetsDto,
  SourceTypeFilter,
} from './dto/query-content-assets.dto';
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

/** Một account cho ô "Editor" (người dựng video/ảnh). */
export interface EditorOption {
  id: string;
  name: string;
  email: string;
  /** `false` = đã vô hiệu hoá: **lọc được** nhưng **không gán mới** được. */
  isActive: boolean;
}

/** Mã lỗi unique constraint của Prisma — dùng để đổi 500 thành 409. */
const PRISMA_UNIQUE_VIOLATION = 'P2002';

/**
 * Đầu vào tạo bài **sau khi file đã nằm trên Drive**. `CreateContentAssetDto`
 * khớp đúng shape này, nên `POST /content-assets` (người dùng gọi trực tiếp) và
 * worker `media-upload` (plan 23) dùng **chung một** đường tạo bài — không có
 * bản logic thứ hai để lệch nhau.
 */
export interface CreateContentAssetInput {
  title: string;
  description?: string;
  category: string;
  caption: string;
  hashtags?: string;
  mediaType: MediaType;
  driveFileId: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileSize?: number;
  editorId?: string;
  assignedPageIds?: string[];
  extraFiles?: CreateContentAssetFileInput[];
  /** Plan 24: fileId GỐC bên Drive người khác khi bài được nhập bằng link. */
  sourceDriveFileId?: string;
  /**
   * Plan 24 §0.3-1: ép bài vào hàng chờ duyệt **kể cả** khi actor là ADMIN.
   * Dùng khi nhập từ link mà chưa có caption — caption `'-'` không phải nội
   * dung đăng được, tự duyệt là mở đường cho Bot đăng bài "-" lên Page thật.
   */
  forceReview?: boolean;
  /**
   * Plan 27: chỉ user có `reup:view` mới ghi được giá trị này — role khác gửi
   * lên bị **bỏ qua** và luôn ghi `MANUAL` (RBAC field-level, đúng khuôn đã chặn
   * `status`/`isAds` với role CONTENT). Bỏ trống ⇒ `MANUAL`.
   */
  sourceType?: ContentSource;
}

/** Một ảnh phụ của bài nhiều ảnh — file đã đẩy lên Drive xong. */
export interface CreateContentAssetFileInput {
  driveFileId: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileSize?: number;
}

@Injectable()
export class ContentAssetsService {
  constructor(
    private readonly repository: ContentAssetsRepository,
    private readonly usersRepository: UsersRepository,
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
      assignment: query.assignment,
      category: query.category,
      status: query.status,
      isAds: query.isAds,
      isActive: query.isActive,
      search: query.search,
      createdBy,
      editorId: query.editorId,
      sourceType: resolveSourceTypeFilter(query.sourceType, actor),
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
    const asset = await this.getOrFail(id, actor);
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

  /**
   * Account cho ô "Editor" — mọi user role EDITOR, **kèm cả người đã vô hiệu hoá**
   * (cờ `isActive`) — dùng cho cả bộ lọc lẫn form upload/chỉnh sửa, không lọc
   * theo trạng thái. `GET /users` gác `users:manage` (ADMIN) nên CONTENT
   * không lấy được danh sách này ở đó, mà CONTENT vẫn phải chọn editor cho bài mình.
   */
  async findEditorOptions(): Promise<EditorOption[]> {
    const editors = await this.usersRepository.findByRole(UserRole.EDITOR);
    return editors.map((editor) => ({
      id: editor.id,
      name: editor.name,
      email: editor.email,
      isActive: editor.isActive,
    }));
  }

  /**
   * `internal` là đường **chỉ code phía server gọi được** (worker media-upload),
   * không thể chạm tới từ HTTP — controller không có tham số thứ 3.
   *
   * Cần nó vì luật RBAC ở `resolveSourceTypeFilter`/`create` áp cho **đầu vào
   * của client**: bài reup do cron sinh ra phải là `REUP` bất kể actor là ai.
   * Nếu suy ra từ quyền của `actor` (người tạo chủ đề) thì hôm nào người đó bị
   * hạ quyền, video reup sẽ **âm thầm** rơi vào kho MANUAL của mọi role.
   */
  async create(
    dto: CreateContentAssetInput,
    actor: AuthenticatedUser,
    internal?: { sourceType?: ContentSource; forceApprove?: boolean },
  ): Promise<ContentAssetResponse> {
    const assignedPageIds = dedupe(dto.assignedPageIds ?? []);
    const extraFiles = dto.extraFiles ?? [];
    this.assertExtraFilesValid(extraFiles, dto.mediaType);
    await this.assertPagesExist(assignedPageIds);
    await this.assertEditorSelectable(dto.editorId);

    // ADMIN/SUPER_ADMIN tự upload thì khỏi phải tự duyệt lại bài của chính mình:
    // vào thẳng APPROVED và ghi luôn người duyệt. Role khác vẫn qua hàng chờ duyệt.
    // `forceReview` thắng tất cả (bài nhập từ link chưa có caption).
    // `internal.forceApprove` = chủ đề reup bật `autoApprove` (plan 29, QĐ-5).
    const autoApproved =
      internal?.forceApprove === true ||
      (isAdminLevel(actor.role) && dto.forceReview !== true);

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
      sourceDriveFileId: dto.sourceDriveFileId,
      // Đường `internal` (worker) thắng: bài reup phải là REUP bất kể actor là ai.
      // Còn lại là RBAC field-level: thiếu `reup:view` ⇒ giá trị client gửi bị
      // BỎ QUA, luôn ghi MANUAL — client không tự nâng loại bài của mình được.
      sourceType:
        internal?.sourceType ??
        (canViewReup(actor)
          ? (dto.sourceType ?? ContentSource.MANUAL)
          : ContentSource.MANUAL),
      createdById: actor.id,
      updatedById: actor.id,
      editorId: dto.editorId,
      assignedPageIds,
      status: autoApproved ? ContentStatus.APPROVED : undefined,
      approvedById: autoApproved ? actor.id : undefined,
      extraFiles,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.CONTENT_UPLOAD,
      resource: `content_asset:${created.id}`,
      afterValue: {
        title: created.title,
        driveFileId: created.driveFileId,
        status: created.status,
        imageCount: 1 + extraFiles.length,
      },
    });

    return toContentAssetResponse(created);
  }

  async update(
    id: string,
    dto: UpdateContentAssetDto,
    actor: AuthenticatedUser,
  ): Promise<ContentAssetResponse> {
    const current = await this.getOrFail(id, actor);
    this.assertOwnership(current, actor);
    this.assertCanSetReviewFields(dto, actor);
    if (dto.editorId !== undefined && dto.editorId !== null) {
      await this.assertEditorSelectable(dto.editorId);
    }

    const data: UpdateContentAssetData = {
      title: dto.title,
      description: dto.description,
      category: dto.category?.trim(),
      caption: dto.caption,
      hashtags: dto.hashtags,
      updatedById: actor.id,
    };

    if (dto.isAds !== undefined) data.isAds = dto.isAds;
    // "Đang dùng" không phải field duyệt ⇒ ai sửa được bài thì đổi được.
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    // `null` = gỡ người dựng; `undefined` = không đụng tới field này.
    if (dto.editorId !== undefined) data.editorId = dto.editorId;

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
    const current = await this.getOrFail(id, actor);
    await this.removeExisting(current, actor);

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.CONTENT_DELETE,
      resource: `content_asset:${id}`,
      beforeValue: { title: current.title, driveFileId: current.driveFileId },
    });
  }

  /**
   * Xoá hàng loạt (plan 19). **Không all-or-nothing**: bài nào vướng thì vào
   * `failed` kèm lý do, phần còn lại vẫn xoá. Ghi **một** dòng audit cho cả lô —
   * 100 dòng lẻ làm màn `/audit` không đọc nổi.
   */
  async bulkDelete(
    ids: string[],
    actor: AuthenticatedUser,
  ): Promise<BulkResult> {
    const result = await runBulkSequential(dedupe(ids), async (id) => {
      const current = await this.getOrFail(id, actor);
      try {
        await this.removeExisting(current, actor);
      } catch (error) {
        // Gắn tiêu đề bài vào lỗi để UI liệt kê được "bài nào bị bỏ qua".
        throw new BulkItemError(current.title, messageOf(error));
      }
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.CONTENT_BULK_DELETE,
      resource: 'content_asset:bulk',
      afterValue: {
        requested: result.requested,
        deletedIds: result.succeeded,
        failedCount: result.failed.length,
      },
    });

    return result;
  }

  /**
   * Ngưng dùng / dùng lại hàng loạt. Chỉ đụng đúng một cột boolean nên phần ghi
   * làm bằng **một** `updateMany` sau khi đã lọc quyền từng bài.
   */
  async bulkSetActive(
    ids: string[],
    isActive: boolean,
    actor: AuthenticatedUser,
  ): Promise<BulkResult> {
    const allowedIds: string[] = [];
    const result = await runBulkSequential(dedupe(ids), async (id) => {
      const current = await this.getOrFail(id, actor);
      try {
        this.assertOwnership(current, actor);
      } catch (error) {
        throw new BulkItemError(current.title, messageOf(error));
      }
      allowedIds.push(id);
    });

    if (allowedIds.length > 0) {
      await this.repository.setActiveMany(allowedIds, isActive, actor.id);
    }

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.CONTENT_BULK_ACTIVE,
      resource: 'content_asset:bulk',
      afterValue: {
        isActive,
        requested: result.requested,
        changedIds: allowedIds,
        failedCount: result.failed.length,
      },
    });

    return result;
  }

  /**
   * Phần xoá dùng chung cho xoá đơn lẻ và xoá hàng loạt: kiểm quyền → chặn bài đã
   * đăng → xoá file Drive → xoá bản ghi. Xoá file trước để không còn file mồ côi
   * trên Drive khi bản ghi đã biến mất.
   */
  private async removeExisting(
    current: ContentAssetWithActors,
    actor: AuthenticatedUser,
  ): Promise<void> {
    this.assertOwnership(current, actor);

    const published = current.assignments.filter(
      (assignment) => assignment.publishedAt !== null,
    );
    if (published.length > 0) {
      throw new ConflictException(
        `Bài đã đăng trên ${published.length} page — không xoá được`,
      );
    }

    // Bài nhập từ Drive mà KHÔNG tick "Copy data": `drive_file_id` là file **của
    // người khác** (nên nó trùng `source_drive_file_id`). Xoá nó là xoá dữ liệu
    // ngoài phạm vi của tool — chỉ xoá bản ghi, để nguyên file gốc.
    if (current.sourceDriveFileId !== current.driveFileId) {
      const storage = await this.driveFactory.get();
      // Bài nhiều ảnh: xoá **mọi** file, không chỉ ảnh đại diện — `content_asset_files`
      // cascade theo bản ghi nên không còn ai nhớ những fileId kia nữa.
      for (const file of [current, ...(current.extraFiles ?? [])]) {
        await storage.delete(file.driveFileId);
      }
    }
    await this.repository.delete(current.id);
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

    if (before.isActive !== after.isActive) {
      await this.auditService.log({
        userId: actor.id,
        action: AuditAction.CONTENT_ACTIVE_TOGGLE,
        resource: `content_asset:${after.id}`,
        beforeValue: { isActive: before.isActive },
        afterValue: { isActive: after.isActive },
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

  /**
   * Người dựng phải là account **role EDITOR** — không phân biệt còn hoạt động
   * hay đã bị khoá (bài cũ vẫn cần gán đúng người dựng). Gửi id lạ / user role
   * khác là input sai ⇒ 400 (FK ở DB không diễn tả được ràng buộc theo role).
   */
  private async assertEditorSelectable(editorId?: string): Promise<void> {
    if (editorId === undefined) return;
    const editor = await this.usersRepository.findById(editorId);
    if (editor === null || editor.role !== UserRole.EDITOR) {
      throw new BadRequestException(
        'Editor phải là tài khoản có vai trò Editor',
      );
    }
  }

  /**
   * Ảnh phụ chỉ có nghĩa với bài **ảnh**: Graph API không ghép nhiều video (hay
   * trộn ảnh–video) vào một bài feed, nên chặn ngay ở đây thay vì để lỗi nổ lúc
   * đăng — khi đó file đã nằm trên Drive và bài đã vào kho.
   */
  private assertExtraFilesValid(
    extraFiles: unknown[],
    mediaType: MediaType,
  ): void {
    if (extraFiles.length === 0) return;

    if (mediaType !== MediaType.image) {
      throw new BadRequestException(
        'Chỉ bài ảnh mới ghép được nhiều file trong 1 bài — video phải mỗi bài 1 file',
      );
    }

    // +1 vì ảnh đầu tiên là chính record, không nằm trong `extraFiles`.
    const total = extraFiles.length + 1;
    if (total > MAX_IMAGES_PER_CONTENT_ASSET) {
      throw new BadRequestException(
        `Một bài chỉ ghép được tối đa ${MAX_IMAGES_PER_CONTENT_ASSET} ảnh (giới hạn của Facebook), đang gửi ${total}`,
      );
    }
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

  /**
   * Cửa duy nhất để lấy 1 bài theo id — `findOne`/`update`/`remove`/`bulk*` đều
   * đi qua đây, nên luật "bài REUP vô hình với role thường" đặt ở đây là phủ hết
   * mọi đường vào cùng lúc (plan 27 §3.2, rủi ro R1c).
   *
   * **404 chứ không 403** là cố ý: 403 xác nhận "bài này có tồn tại, bạn không đủ
   * quyền" — tức vẫn tiết lộ sự tồn tại của kho reup cho người đoán id.
   */
  private async getOrFail(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<ContentAssetWithActors> {
    const asset = await this.repository.findById(id);
    if (asset === null) {
      throw new NotFoundException('Không tìm thấy content');
    }
    if (asset.sourceType === ContentSource.REUP && !canViewReup(actor)) {
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

/** Quyền xem kho reup — hôm nay chỉ SUPER_ADMIN có (plan 26). */
function canViewReup(actor: AuthenticatedUser): boolean {
  return hasPermission(actor.role, 'reup:view');
}

/**
 * Dịch bộ lọc "Loại" của client thành điều kiện thật cho repository — **đây là
 * ranh giới bảo mật của plan 27, không phải tiện ích hiển thị.**
 *
 * ```text
 * KHÔNG có 'reup:view'  ⇒ BỎ QUA hoàn toàn giá trị client gửi (kể cả REUP/ALL)
 *                         ⇒ ÉP CỨNG MANUAL. Không ném 403: role cũ phải dùng
 *                           màn này y như trước, và ném lỗi là tự tố cáo rằng
 *                           có tồn tại loại bài khác.
 * CÓ 'reup:view'        ⇒ không truyền ⇒ mặc định REUP (màn Reup là màn chính
 *                           của họ) · MANUAL/REUP ⇒ đúng loại đó · ALL ⇒ không lọc
 * ```
 *
 * Trả `undefined` = **không lọc** (chỉ xảy ra với `ALL` của người có quyền).
 */
function resolveSourceTypeFilter(
  requested: SourceTypeFilter | undefined,
  actor: AuthenticatedUser,
): ContentSource | undefined {
  if (!canViewReup(actor)) return ContentSource.MANUAL;
  if (requested === undefined) return ContentSource.REUP;
  if (requested === 'ALL') return undefined;
  return requested === 'REUP' ? ContentSource.REUP : ContentSource.MANUAL;
}

/** '#a  #b' -> ['#a', '#b']; token thiếu '#' vẫn nhận và được thêm vào. */
function splitHashtags(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token !== '' && token !== '#')
    .map((token) => (token.startsWith('#') ? token : `#${token}`));
}

/** Lấy câu lỗi để nhét vào báo cáo lô; lỗi lạ vẫn có chữ đọc được. */
function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message;
  return 'Lỗi không xác định';
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
