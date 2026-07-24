import { Injectable } from '@nestjs/common';
import type {
  ContentAsset,
  MediaType,
  Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface FindContentAssetsFilter {
  mediaType?: MediaType;
  category?: string;
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
}

export interface UpdateContentAssetData {
  title?: string;
  description?: string;
  category?: string;
  caption?: string;
  hashtags?: string;
}

/** Nơi duy nhất viết Prisma query cho bảng content_assets (rule 01). */
@Injectable()
export class ContentAssetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filter: FindContentAssetsFilter,
  ): Promise<{ data: ContentAsset[]; total: number }> {
    const where: Prisma.ContentAssetWhereInput = {};
    if (filter.mediaType !== undefined) where.mediaType = filter.mediaType;
    if (filter.category !== undefined) where.category = filter.category;
    if (filter.createdBy !== undefined) where.createdById = filter.createdBy;
    if (filter.search !== undefined && filter.search !== '') {
      where.title = { contains: filter.search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.contentAsset.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.contentAsset.count({ where }),
    ]);

    return { data, total };
  }

  findById(id: string): Promise<ContentAsset | null> {
    return this.prisma.contentAsset.findUnique({ where: { id } });
  }

  create(data: CreateContentAssetData): Promise<ContentAsset> {
    return this.prisma.contentAsset.create({
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
      },
    });
  }

  update(id: string, data: UpdateContentAssetData): Promise<ContentAsset> {
    return this.prisma.contentAsset.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.contentAsset.delete({ where: { id } });
  }
}
