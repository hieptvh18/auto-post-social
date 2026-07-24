import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ContentAsset } from '../../../generated/prisma/client';
import { UserRole } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { DriveStorageFactory } from '../../infra/drive/drive-storage.factory';
import { AuditAction, AuditService } from '../audit/audit.service';
import {
  toContentAssetResponse,
  type ContentAssetResponse,
} from './content-asset.mapper';
import { ContentAssetsRepository } from './content-assets.repository';
import type { CreateContentAssetDto } from './dto/create-content-asset.dto';
import type { QueryContentAssetsDto } from './dto/query-content-assets.dto';
import type { UpdateContentAssetDto } from './dto/update-content-asset.dto';

export interface PaginatedContentAssets {
  data: ContentAssetResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

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

  async create(
    dto: CreateContentAssetDto,
    actor: AuthenticatedUser,
  ): Promise<ContentAssetResponse> {
    const created = await this.repository.create({
      title: dto.title,
      description: dto.description,
      caption: dto.caption,
      hashtags: dto.hashtags,
      category: dto.category,
      mediaType: dto.mediaType,
      driveFileId: dto.driveFileId,
      driveUrl: dto.driveUrl,
      thumbnailUrl: dto.thumbnailUrl,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      createdById: actor.id,
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

    const updated = await this.repository.update(id, {
      title: dto.title,
      description: dto.description,
      category: dto.category,
      caption: dto.caption,
      hashtags: dto.hashtags,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.CONTENT_UPDATE,
      resource: `content_asset:${id}`,
      beforeValue: { title: current.title, category: current.category },
      afterValue: { title: updated.title, category: updated.category },
    });

    return toContentAssetResponse(updated);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const current = await this.getOrFail(id);
    this.assertOwnership(current, actor);

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

  private async getOrFail(id: string): Promise<ContentAsset> {
    const asset = await this.repository.findById(id);
    if (asset === null) {
      throw new NotFoundException('Không tìm thấy content');
    }
    return asset;
  }

  /** CONTENT chỉ thao tác bài của chính mình; EDITOR/ADMIN thao tác mọi bài. */
  private assertOwnership(asset: ContentAsset, actor: AuthenticatedUser): void {
    if (actor.role === UserRole.CONTENT && asset.createdById !== actor.id) {
      throw new ForbiddenException('Chỉ thao tác được trên bài của chính mình');
    }
  }
}
