import { Injectable } from '@nestjs/common';
import {
  MediaUploadSource,
  MediaUploadStatus,
  type Prisma,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type {
  MediaUploadFileInfo,
  MediaUploadMetadata,
} from './media-upload.constants';

/** Mọi trạng thái "chưa kết thúc" — job đang chiếm slot hàng đợi. */
export const PENDING_STATUSES = [
  MediaUploadStatus.QUEUED,
  MediaUploadStatus.UPLOADING_TO_DRIVE,
  MediaUploadStatus.COPYING_FROM_DRIVE,
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
  source: MediaUploadSource;
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
  /** Bỏ trống ⇒ `LOCAL_FILE` (đường upload từ máy của plan 23). */
  source?: MediaUploadSource;
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

/** Đủ để biết một fileId nguồn đã được nhập vào bài nào (plan 24). */
export interface ImportedSourceFile {
  sourceDriveFileId: string;
  contentAssetId: string;
  title: string;
}

const CREATOR_INCLUDE = {
  createdBy: { select: { id: true, name: true, email: true, role: true } },
} as const;

@Injectable()
export class MediaUploadJobsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đếm job đang chiếm **đĩa tạm** trên toàn hệ thống — tài nguyên bị bảo vệ là
   * đĩa/RAM của cả server, đếm theo từng user sẽ không chặn được gì.
   *
   * Chỉ đếm `LOCAL_FILE`: job `DRIVE_LINK` copy phía Google, không ghi byte nào
   * xuống đĩa nên không được chiếm suất của trần này (plan 24 §3.5).
   */
  countPendingLocalFiles(): Promise<number> {
    return this.prisma.mediaUploadJob.count({
      where: {
        source: MediaUploadSource.LOCAL_FILE,
        status: { in: [...PENDING_STATUSES] },
      },
    });
  }

  async create(data: CreateMediaUploadJobData): Promise<MediaUploadJobRecord> {
    const created = await this.prisma.mediaUploadJob.create({
      include: CREATOR_INCLUDE,
      data: {
        source: data.source,
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

  /**
   * Những fileId nguồn nào trong danh sách đã được nhập vào kho rồi — dùng để
   * **cảnh báo** (không chặn) ở bước xem trước.
   */
  async findImportedSourceFiles(
    sourceDriveFileIds: string[],
  ): Promise<ImportedSourceFile[]> {
    if (sourceDriveFileIds.length === 0) return [];
    const rows = await this.prisma.contentAsset.findMany({
      where: { sourceDriveFileId: { in: sourceDriveFileIds } },
      select: { id: true, title: true, sourceDriveFileId: true },
    });
    return rows.flatMap((row) =>
      row.sourceDriveFileId === null
        ? []
        : [
            {
              sourceDriveFileId: row.sourceDriveFileId,
              contentAssetId: row.id,
              title: row.title,
            },
          ],
    );
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
  source: MediaUploadSource;
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
