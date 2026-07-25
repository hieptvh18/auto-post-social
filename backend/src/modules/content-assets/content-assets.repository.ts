import { Injectable } from '@nestjs/common';
import type {
  ContentAsset,
  ContentStatus,
  MediaType,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Subset user an toàn để trả ra API — KHÔNG bao giờ kèm `passwordHash`. */
const ACTOR_SELECT = { id: true, name: true, email: true } as const;

/** Chỉ 3 field này của user được join ra ngoài (người upload / người sửa). */
export interface ContentActor {
  id: string;
  name: string;
  email: string;
}

/** Một dòng phân bổ content -> page, kèm tên page để FE hiện tag. */
export interface ContentAssignment {
  id: string;
  facebookPageId: string;
  publishedAt: Date | null;
  facebookPostId: string | null;
  facebookPage: { id: string; pageName: string };
}

/** Content kèm quan hệ đã join — shape mà mapper nhận vào. */
export interface ContentAssetWithActors extends ContentAsset {
  createdBy: ContentActor;
  updatedBy: ContentActor | null;
  assignments: ContentAssignment[];
}

const ACTOR_INCLUDE = {
  createdBy: { select: ACTOR_SELECT },
  updatedBy: { select: ACTOR_SELECT },
  assignments: {
    select: {
      id: true,
      facebookPageId: true,
      publishedAt: true,
      facebookPostId: true,
      facebookPage: { select: { id: true, pageName: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
} as const satisfies Prisma.ContentAssetInclude;

export interface FindContentAssetsFilter {
  mediaType?: MediaType;
  category?: string;
  status?: ContentStatus;
  isAds?: boolean;
  search?: string;
  createdBy?: string;
  page: number;
  limit: number;
}

export interface CreateContentAssetData {
  title: string;
  description?: string;
  caption: string;
  hashtags?: string;
  category: string;
  mediaType: MediaType;
  driveFileId: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileSize?: number;
  createdById: string;
  /** Người upload cũng là người "sửa" đầu tiên — UI không bị trống cột này. */
  updatedById: string;
  /** Page gán ngay lúc upload; bổ sung sau qua PATCH cũng được. */
  assignedPageIds?: string[];
}

export interface UpdateContentAssetData {
  title?: string;
  description?: string;
  category?: string;
  caption?: string;
  hashtags?: string;
  status?: ContentStatus;
  isAds?: boolean;
  /** `null` = xoá lý do (khi duyệt lại hoặc trả về chờ duyệt). */
  rejectComment?: string | null;
  /** `null` = rút phê duyệt. */
  approvedById?: string | null;
  /** Người thực hiện lần sửa này — service luôn truyền `actor.id`. */
  updatedById: string;
}

/** Diff phân bổ page service đã tính sẵn — repository chỉ việc ghi. */
export interface AssignmentDiff {
  addPageIds: string[];
  removePageIds: string[];
}

/** Nơi duy nhất viết Prisma query cho bảng content_assets (rule 01). */
@Injectable()
export class ContentAssetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filter: FindContentAssetsFilter,
  ): Promise<{ data: ContentAssetWithActors[]; total: number }> {
    const where: Prisma.ContentAssetWhereInput = {};
    if (filter.mediaType !== undefined) where.mediaType = filter.mediaType;
    if (filter.category !== undefined) where.category = filter.category;
    if (filter.status !== undefined) where.status = filter.status;
    if (filter.isAds !== undefined) where.isAds = filter.isAds;
    if (filter.createdBy !== undefined) where.createdById = filter.createdBy;
    if (filter.search !== undefined && filter.search !== '') {
      where.title = { contains: filter.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.contentAsset.findMany({
        where,
        include: ACTOR_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.contentAsset.count({ where }),
    ]);

    return { data, total };
  }

  findById(id: string): Promise<ContentAssetWithActors | null> {
    return this.prisma.contentAsset.findUnique({
      where: { id },
      include: ACTOR_INCLUDE,
    });
  }

  create(data: CreateContentAssetData): Promise<ContentAssetWithActors> {
    const pageIds = data.assignedPageIds ?? [];
    return this.prisma.contentAsset.create({
      include: ACTOR_INCLUDE,
      data: {
        title: data.title,
        description: data.description,
        caption: data.caption,
        hashtags: data.hashtags,
        category: data.category,
        mediaType: data.mediaType,
        driveFileId: data.driveFileId,
        driveUrl: data.driveUrl,
        thumbnailUrl: data.thumbnailUrl,
        mimeType: data.mimeType,
        fileSize:
          data.fileSize === undefined ? undefined : BigInt(data.fileSize),
        createdById: data.createdById,
        updatedById: data.updatedById,
        assignments:
          pageIds.length === 0
            ? undefined
            : { create: pageIds.map((facebookPageId) => ({ facebookPageId })) },
      },
    });
  }

  /**
   * Sửa content + đồng bộ phân bổ page trong **một** transaction: ghi assignment
   * hỏng thì field thường cũng không được lưu nửa vời.
   */
  update(
    id: string,
    data: UpdateContentAssetData,
    assignments?: AssignmentDiff,
  ): Promise<ContentAssetWithActors> {
    if (assignments === undefined) {
      return this.prisma.contentAsset.update({
        where: { id },
        include: ACTOR_INCLUDE,
        data,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      if (assignments.removePageIds.length > 0) {
        await tx.contentPageAssignment.deleteMany({
          where: {
            contentAssetId: id,
            facebookPageId: { in: assignments.removePageIds },
          },
        });
      }
      if (assignments.addPageIds.length > 0) {
        await tx.contentPageAssignment.createMany({
          data: assignments.addPageIds.map((facebookPageId) => ({
            contentAssetId: id,
            facebookPageId,
          })),
        });
      }
      return tx.contentAsset.update({
        where: { id },
        include: ACTOR_INCLUDE,
        data,
      });
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.contentAsset.delete({ where: { id } });
  }

  /** Page còn sống trong danh sách id truyền vào — dùng để validate phân bổ. */
  async findExistingPageIds(pageIds: string[]): Promise<string[]> {
    const pages = await this.prisma.facebookPage.findMany({
      where: { id: { in: pageIds }, deletedAt: null },
      select: { id: true },
    });
    return pages.map((page) => page.id);
  }

  /** Danh mục đang thực sự có bài, kèm số bài — nguồn cho ô "Dạng" gõ được. */
  async findCategoryCounts(): Promise<{ category: string; count: number }[]> {
    const rows = await this.prisma.contentAsset.groupBy({
      by: ['category'],
      _count: { _all: true },
    });
    return rows.map((row) => ({
      category: row.category,
      count: row._count._all,
    }));
  }

  /**
   * Gom cột `hashtags` của mọi bài để service tách token làm gợi ý.
   * Chỉ select đúng 1 cột — không kéo cả bảng ra khỏi DB.
   */
  async findAllHashtagStrings(): Promise<string[]> {
    const rows = await this.prisma.contentAsset.findMany({
      where: { hashtags: { not: null } },
      select: { hashtags: true },
    });
    return rows
      .map((row) => row.hashtags)
      .filter(
        (value): value is string => value !== null && value.trim() !== '',
      );
  }
}
