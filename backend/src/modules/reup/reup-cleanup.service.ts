import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DriveStorageFactory } from '../../infra/drive/drive-storage.factory';
import { AuditAction, AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { ReupCleanupRepository } from './reup-cleanup.repository';
import { ReupVideosRepository } from './reup-videos.repository';

/** Bản cho API — `BigInt` không serialize được sang JSON, đổi sang `number`
 * (an toàn: dung lượng video tối đa vài GB, còn xa `Number.MAX_SAFE_INTEGER`). */
export interface CleanupPreviewItem {
  id: string;
  title: string;
  driveFileId: string;
  fileSize: number | null;
  publishedAt: Date;
}

export interface CleanupPreview {
  enabled: boolean;
  retentionDays: number;
  items: CleanupPreviewItem[];
  totalBytes: number;
}

export interface CleanupRunResult {
  deletedCount: number;
  freedBytes: number;
  failedCount: number;
}

/**
 * Cron C — dọn file Drive của bài reup đã đăng quá `retentionDays` ngày, GIỮ
 * NGUYÊN bản ghi `content_assets`/`publish_jobs`/insight (plan 30 §3.1).
 *
 * Ba luật chặn không có ngoại lệ (§3.2), đều nằm trong
 * `ReupCleanupRepository.findCandidates`: chỉ `source_type = REUP`, chỉ bài
 * chưa xoá resource, chỉ bài không còn publish_job treo (C6).
 */
@Injectable()
export class ReupCleanupService {
  private readonly logger = new Logger(ReupCleanupService.name);

  constructor(
    private readonly repository: ReupCleanupRepository,
    private readonly videos: ReupVideosRepository,
    private readonly settings: SettingsService,
    private readonly driveFactory: DriveStorageFactory,
    private readonly auditService: AuditService,
  ) {}

  async preview(): Promise<CleanupPreview> {
    const config = await this.settings.getReupCleanupConfig();
    const items = await this.repository.findCandidates(config.retentionDays);
    const totalBytes = items.reduce(
      (sum, item) => sum + (item.fileSize ?? 0n),
      0n,
    );
    return {
      enabled: config.enabled,
      retentionDays: config.retentionDays,
      items: items.map((item) => ({
        ...item,
        fileSize: item.fileSize === null ? null : Number(item.fileSize),
      })),
      totalBytes: Number(totalBytes),
    };
  }

  /**
   * Chạy dọn. `actorId = null` ⇒ cron gọi (Bot); có id ⇒ người vận hành bấm
   * "Dọn ngay". Audit chỉ ghi **1 dòng cho cả lô**, và CHỈ KHI có bài bị xoá —
   * chạy rỗng không tạo rác trong audit log.
   */
  async run(actorId: string | null): Promise<CleanupRunResult> {
    const config = await this.settings.getReupCleanupConfig();
    if (!config.enabled) {
      this.logger.log(
        'Dọn dẹp reup đang tắt (enabled=false) — bỏ qua lượt này.',
      );
      return { deletedCount: 0, freedBytes: 0, failedCount: 0 };
    }

    const candidates = await this.repository.findCandidates(
      config.retentionDays,
    );
    if (candidates.length === 0) {
      return { deletedCount: 0, freedBytes: 0, failedCount: 0 };
    }

    const storage = await this.driveFactory.get();
    let deletedCount = 0;
    let freedBytes = 0n;
    let failedCount = 0;

    for (const item of candidates) {
      try {
        // 404 = file đã không còn ⇒ vẫn coi là thành công (§3.1 bước 1).
        await storage.deleteIfExists(item.driveFileId);
        await this.repository.markResourceDeleted(item.id);
        deletedCount += 1;
        freedBytes += item.fileSize ?? 0n;
      } catch (error) {
        // R4: lỗi Drive tạm thời (không phải 404) ⇒ KHÔNG set resourceDeletedAt,
        // để lượt cron sau thử lại — không được đánh dấu "đã xoá" khi file còn.
        failedCount += 1;
        this.logger.error(
          `Xoá file Drive thất bại cho content ${item.id} (fileId ${item.driveFileId}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (deletedCount > 0) {
      await this.auditService.log({
        userId: actorId,
        action:
          actorId === null
            ? AuditAction.REUP_CLEANUP_CRON
            : AuditAction.REUP_CLEANUP_MANUAL,
        resource: 'reup_cleanup',
        afterValue: {
          deletedCount,
          freedBytes: freedBytes.toString(),
          failedCount,
          retentionDays: config.retentionDays,
        },
      });
    }

    return { deletedCount, freedBytes: Number(freedBytes), failedCount };
  }

  /**
   * `DELETE /reup/videos/:id/resource` — xoá file của MỘT video reup theo yêu
   * cầu tay. `id` là `reup_videos.id` (cùng khuôn với retry/skip), không phải
   * `content_assets.id` trực tiếp — video phải đã `IMPORTED` mới có bài để xoá.
   */
  async deleteOne(reupVideoId: string, actorId: string): Promise<void> {
    const video = await this.videos.findById(reupVideoId);
    if (video === null) {
      throw new NotFoundException('Không tìm thấy video reup');
    }
    if (video.contentAssetId === null) {
      throw new UnprocessableEntityException(
        'Video này chưa vào kho (chưa IMPORTED) — không có file để xoá',
      );
    }

    const asset = await this.repository.findOneEligible(video.contentAssetId);
    if (asset === null) {
      throw new NotFoundException('Không tìm thấy bài trong kho');
    }
    // Luật 1 (§3.2) — chặn tường minh dù đường vào này luôn xuất phát từ
    // reup_videos, không suy diễn ngầm.
    if (asset.sourceType !== 'REUP') {
      throw new UnprocessableEntityException(
        'Chỉ xoá được file của bài reup (sourceType = REUP)',
      );
    }
    if (asset.status !== 'PUBLISHED') {
      throw new UnprocessableEntityException(
        'Chỉ xoá file của bài đã PUBLISHED',
      );
    }
    if (asset.resourceDeletedAt !== null) {
      throw new UnprocessableEntityException('File của bài này đã bị xoá rồi');
    }
    if (asset.hasPendingJob) {
      throw new UnprocessableEntityException(
        'Bài còn job đăng chưa kết thúc ở page khác — chưa xoá được file',
      );
    }

    const storage = await this.driveFactory.get();
    await storage.deleteIfExists(asset.driveFileId);
    await this.repository.markResourceDeleted(asset.id);

    await this.auditService.log({
      userId: actorId,
      action: AuditAction.REUP_RESOURCE_DELETE,
      resource: `content_asset:${asset.id}`,
      afterValue: { driveFileId: asset.driveFileId },
    });
  }
}
