import { Injectable } from '@nestjs/common';
import {
  MediaUploadStatus,
  type Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type {
  MediaUploadFileInfo,
  MediaUploadMetadata,
} from './media-upload.constants';

/** Hai trạng thái "đang chiếm tài nguyên" (đĩa + slot hàng đợi). */
export const PENDING_STATUSES = [
  MediaUploadStatus.QUEUED,
  MediaUploadStatus.UPLOADING_TO_DRIVE,
] as const;

/** Người tạo job — cần `role` để worker tạo bài với đúng quyền của người đó. */
export interface MediaUploadJobActor {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'EDITOR' | 'CONTENT';
}

/** Một job upload, `files`/`metadata` đã parse khỏi JSON thô của Prisma. */
export interface MediaUploadJobRecord {
  id: string;
  status: MediaUploadStatus;
  originalFilename: string;
  fileCount: number;
  totalSize: bigint;
  files: MediaUploadFileInfo[];
  metadata: MediaUploadMetadata;
  errorMessage: string | null;
  attemptCount: number;
  bullJobId: string | null;
  filesRemovedAt: Date | null;
  contentAssetId: string | null;
  createdById: string;
  createdBy: MediaUploadJobActor;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMediaUploadJobData {
  originalFilename: string;
  files: MediaUploadFileInfo[];
  metadata: MediaUploadMetadata;
  createdById: string;
}

export interface UpdateMediaUploadJobData {
  status?: MediaUploadStatus;
  errorMessage?: string | null;
  attemptCount?: number;
  bullJobId?: string | null;
  filesRemovedAt?: Date | null;
  contentAssetId?: string | null;
}

export interface FindMediaUploadJobsFilter {
  /** `undefined` = mọi người (chỉ ADMIN/EDITOR mới được truyền như vậy). */
  createdById?: string;
  status?: MediaUploadStatus;
  limit: number;
}

const CREATOR_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, role: true } },
} as const;

@Injectable()
export class MediaUploadJobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đếm job đang chiếm chỗ trên **toàn hệ thống** — tài nguyên bị bảo vệ là đĩa
   * và RAM của cả server, đếm theo từng user sẽ không chặn được gì.
   */
  countPending(): Promise<number> {
    return this.prisma.mediaUploadJob.count({
      where: { status: { in: [...PENDING_STATUSES] } },
    });
  }

  async create(data: CreateMediaUploadJobData): Promise<MediaUploadJobRecord> {
    const created = await this.prisma.mediaUploadJob.create({
      include: CREATOR_INCLUDE,
      data: {
        originalFilename: data.originalFilename,
        fileCount: data.files.length,
        totalSize: BigInt(data.files.reduce((sum, file) => sum + file.size, 0)),
        files: data.files as unknown as Prisma.InputJsonValue,
        metadata: data.metadata as unknown as Prisma.InputJsonValue,
        createdById: data.createdById,
      },
    });
    return toRecord(created);
  }

  async findById(id: string): Promise<MediaUploadJobRecord | null> {
    const found = await this.prisma.mediaUploadJob.findUnique({
      where: { id },
      include: CREATOR_INCLUDE,
    });
    return found === null ? null : toRecord(found);
  }

  async findMany(
    filter: FindMediaUploadJobsFilter,
  ): Promise<MediaUploadJobRecord[]> {
    const rows = await this.prisma.mediaUploadJob.findMany({
      where: {
        createdById: filter.createdById,
        status: filter.status,
      },
      include: CREATOR_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
    });
    return rows.map(toRecord);
  }

  async update(
    id: string,
    data: UpdateMediaUploadJobData,
  ): Promise<MediaUploadJobRecord> {
    const updated = await this.prisma.mediaUploadJob.update({
      where: { id },
      data,
      include: CREATOR_INCLUDE,
    });
    return toRecord(updated);
  }

  /** Job còn dở từ phiên trước — worker đã chết, không có ai chạy tiếp. */
  findPending(): Promise<MediaUploadJobRecord[]> {
    return this.prisma.mediaUploadJob
      .findMany({
        where: { status: { in: [...PENDING_STATUSES] } },
        include: CREATOR_INCLUDE,
      })
      .then((rows) => rows.map(toRecord));
  }

  /** Job đã kết thúc và quá hạn giữ — dọn file tạm rồi xoá dòng. */
  findTerminalBefore(before: Date): Promise<MediaUploadJobRecord[]> {
    return this.prisma.mediaUploadJob
      .findMany({
        where: {
          status: {
            in: [MediaUploadStatus.SUCCESS, MediaUploadStatus.FAILED],
          },
          updatedAt: { lt: before },
        },
        include: CREATOR_INCLUDE,
      })
      .then((rows) => rows.map(toRecord));
  }

  async deleteMany(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const { count } = await this.prisma.mediaUploadJob.deleteMany({
      where: { id: { in: ids } },
    });
    return count;
  }
}

/** Dòng Prisma (JSON thô) -> record đã có type thật cho service/worker. */
function toRecord(row: {
  id: string;
  status: MediaUploadStatus;
  originalFilename: string;
  fileCount: number;
  totalSize: bigint;
  files: Prisma.JsonValue;
  metadata: Prisma.JsonValue;
  errorMessage: string | null;
  attemptCount: number;
  bullJobId: string | null;
  filesRemovedAt: Date | null;
  contentAssetId: string | null;
  createdById: string;
  createdBy: MediaUploadJobActor;
  createdAt: Date;
  updatedAt: Date;
}): MediaUploadJobRecord {
  return {
    ...row,
    files: row.files as unknown as MediaUploadFileInfo[],
    metadata: row.metadata as unknown as MediaUploadMetadata,
  };
}
