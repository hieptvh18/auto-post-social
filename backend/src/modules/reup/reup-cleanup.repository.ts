import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Một bài reup đủ điều kiện xoá file (hoặc đã liệt kê để xem trước). */
export interface CleanupCandidate {
  id: string;
  title: string;
  driveFileId: string;
  fileSize: bigint | null;
  publishedAt: Date;
}

/**
 * Đúng câu truy vấn ở plan 30 §3.1 — dùng chung cho `preview` và `run` để hai
 * đường không bao giờ lệch nhau (nếu lệch thì preview hứa một đằng, xoá một nẻo).
 *
 * Ba điều kiện không có ngoại lệ (plan 30 §3.2 / README §4):
 * 1. `source_type = REUP` — ranh giới cứng, bài MANUAL không bao giờ vào đây.
 * 2. `resource_deleted_at IS NULL` — không xoá 2 lần.
 * 3. `NOT EXISTS` publish_jobs chưa kết thúc (C6) — page khác của cùng bài còn
 *    job SCHEDULED/QUEUED/PUBLISHING thì chưa được xoá file.
 */
@Injectable()
export class ReupCleanupRepository {
  constructor(private readonly prisma: PrismaService) {}

  findCandidates(retentionDays: number): Promise<CleanupCandidate[]> {
    return this.prisma.$queryRaw<CleanupCandidate[]>`
      SELECT c.id,
             c.title,
             c.drive_file_id AS "driveFileId",
             c.file_size     AS "fileSize",
             a.published_at  AS "publishedAt"
        FROM content_assets c
        JOIN LATERAL (
          SELECT MIN(published_at) AS published_at
            FROM content_page_assignments
           WHERE content_asset_id = c.id
             AND published_at IS NOT NULL
        ) a ON true
       WHERE c.source_type = 'REUP'
         AND c.status = 'PUBLISHED'
         AND c.resource_deleted_at IS NULL
         AND a.published_at < now() - (${retentionDays}::int * interval '1 day')
         AND NOT EXISTS (
           SELECT 1 FROM publish_jobs j
            WHERE j.content_asset_id = c.id
              AND j.status IN ('SCHEDULED', 'QUEUED', 'PUBLISHING')
         )
       ORDER BY a.published_at ASC
    `;
  }

  async markResourceDeleted(id: string): Promise<void> {
    await this.prisma.contentAsset.update({
      where: { id },
      data: { resourceDeletedAt: new Date() },
    });
  }

  /**
   * State đầy đủ của bài đứng sau một `content_asset_id` — dùng cho endpoint
   * xoá tay `DELETE /reup/videos/:id/resource` để service tự quyết định 422
   * hay xoá (luật §3.2, kể cả luật 1 dù đường vào này luôn xuất phát từ một
   * `reup_videos.content_asset_id` nên `sourceType` luôn là REUP trên thực tế —
   * vẫn kiểm tường minh vì đây là "mọi đường vào" mà rule 05 §3.2 luật 1 nói tới).
   */
  findOneEligible(contentAssetId: string): Promise<{
    id: string;
    sourceType: string;
    status: string;
    driveFileId: string;
    resourceDeletedAt: Date | null;
    hasPendingJob: boolean;
  } | null> {
    return this.prisma.$queryRaw<
      {
        id: string;
        sourceType: string;
        status: string;
        driveFileId: string;
        resourceDeletedAt: Date | null;
        hasPendingJob: boolean;
      }[]
    >`
      SELECT c.id,
             c.source_type::text AS "sourceType",
             c.status::text      AS "status",
             c.drive_file_id     AS "driveFileId",
             c.resource_deleted_at AS "resourceDeletedAt",
             EXISTS (
               SELECT 1 FROM publish_jobs j
                WHERE j.content_asset_id = c.id
                  AND j.status IN ('SCHEDULED', 'QUEUED', 'PUBLISHING')
             ) AS "hasPendingJob"
        FROM content_assets c
       WHERE c.id = ${contentAssetId}::uuid
    `.then((rows) => rows[0] ?? null);
  }
}
