import { createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AppConfigService } from '../../config/app-config.service';
import { ClockService } from '../clock/clock.service';
import { DriveStorageFactory } from '../drive/drive-storage.factory';

/** File media đã nằm trên đĩa, sẵn sàng stream đi mà không nạp vào RAM. */
export interface LocalMediaFile {
  path: string;
  size: number;
}

/** Một mục trong cache. `refCount` > 0 nghĩa là đang có job đọc — cấm xoá. */
interface CacheEntry {
  path: string;
  size: number;
  refCount: number;
  /** Mốc lần cuối có người thả tay ra; dùng để tính TTL. */
  releasedAt: number;
}

/**
 * Tải file Drive xuống đĩa **một lần** rồi cho nhiều job dùng chung.
 *
 * Vì sao cần: một video phân bổ cho 4 page sinh ra 4 publish job. Trước đây mỗi
 * job tự tải lại toàn bộ file từ Drive **và** giữ nguyên trong RAM (đo thật:
 * 300MB video ⇒ RSS 1020MB do 3 bản copy Buffer/Uint8Array/Blob). Giờ tải 1 lần
 * xuống đĩa, các job stream từ đó — RAM phẳng, băng thông Drive chia 4.
 *
 * Không dùng LRU/giới hạn dung lượng ở MVP: vòng đời một file rất ngắn (chỉ sống
 * qua một cụm job cùng mốc giờ) nên TTL + ref-count là đủ.
 */
@Injectable()
export class MediaCacheService implements OnModuleInit {
  private readonly logger = new Logger(MediaCacheService.name);
  private readonly entries = new Map<string, CacheEntry>();
  /** Đang tải dở: hai job cùng file thì cùng chờ một promise, không tải 2 lần. */
  private readonly inFlight = new Map<string, Promise<CacheEntry>>();

  constructor(
    private readonly driveFactory: DriveStorageFactory,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Dọn sạch thư mục cache lúc khởi động: file còn sót lại từ lần chạy trước
   * chắc chắn không có ai giữ ref, và có thể là file tải dở do crash.
   */
  async onModuleInit(): Promise<void> {
    const dir = this.config.mediaCache.dir;
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    this.logger.log(`Thư mục cache media: ${dir}`);
  }

  /**
   * Mượn file trong suốt `fn`. File được đảm bảo tồn tại từ lúc `fn` bắt đầu tới
   * lúc `fn` kết thúc, kể cả khi job khác cùng lúc trả file về.
   */
  async withLocalFile<T>(
    driveFileId: string,
    fn: (file: LocalMediaFile) => Promise<T>,
  ): Promise<T> {
    const entry = await this.acquire(driveFileId);
    try {
      return await fn({ path: entry.path, size: entry.size });
    } finally {
      this.release(entry);
    }
  }

  private async acquire(driveFileId: string): Promise<CacheEntry> {
    const cached = this.entries.get(driveFileId);
    if (cached !== undefined) {
      cached.refCount += 1;
      this.logger.debug(
        `Dùng lại file cache ${driveFileId} (ref=${cached.refCount})`,
      );
      return cached;
    }

    const pending = this.inFlight.get(driveFileId);
    if (pending !== undefined) {
      // Job khác đang tải cùng file — chờ chung, không mở thêm kết nối Drive.
      const entry = await pending;
      entry.refCount += 1;
      return entry;
    }

    const promise = this.download(driveFileId);
    this.inFlight.set(driveFileId, promise);
    try {
      const entry = await promise;
      entry.refCount += 1;
      this.entries.set(driveFileId, entry);
      return entry;
    } finally {
      this.inFlight.delete(driveFileId);
    }
  }

  /**
   * Không xoá ngay khi ref về 0: job kế tiếp của cùng video (page thứ 2, 3, 4)
   * chạy ngay sau đó và phải dùng lại được file này. Việc xoá để `sweep` lo.
   */
  private release(entry: CacheEntry): void {
    entry.refCount -= 1;
    if (entry.refCount === 0) {
      entry.releasedAt = this.clock.now().getTime();
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleSweepCron(): Promise<void> {
    await this.sweep(this.clock.now());
  }

  /**
   * Xoá các file hết hạn. Tách khỏi cron và nhận `now` để test gọi được với thời
   * điểm giả — cùng khuôn với `AutoPostSchedulerService.tick` (rule 01 §Thời gian).
   *
   * Trả về số file đã xoá.
   */
  async sweep(now: Date): Promise<number> {
    const ttl = this.config.mediaCache.ttlMs;
    let removed = 0;

    for (const [driveFileId, entry] of [...this.entries]) {
      // Đang có job đọc ⇒ cấm xoá, dù đã quá hạn.
      if (entry.refCount > 0) continue;
      if (now.getTime() - entry.releasedAt < ttl) continue;

      this.entries.delete(driveFileId);
      try {
        await rm(entry.path, { force: true });
        removed += 1;
        this.logger.debug(`Đã xoá file cache ${driveFileId}`);
      } catch (error) {
        // Xoá hụt chỉ tốn đĩa, không được làm hỏng luồng đăng bài.
        this.logger.warn(
          `Không xoá được file cache ${entry.path}: ${String(error)}`,
        );
      }
    }

    return removed;
  }

  /**
   * Tải xuống `<id>.part` rồi mới đổi tên: crash giữa chừng sẽ để lại `.part`
   * (bị dọn lúc khởi động) chứ không để lại file cụt mang đúng tên thật —
   * file cụt đó sẽ bị coi là hợp lệ và đăng lên Facebook một video hỏng.
   */
  private async download(driveFileId: string): Promise<CacheEntry> {
    const dir = this.config.mediaCache.dir;
    await mkdir(dir, { recursive: true });
    const finalPath = join(dir, driveFileId);
    const partPath = `${finalPath}.part`;

    const storage = await this.driveFactory.get();
    const source = await storage.createReadStream(driveFileId);

    try {
      await pipeline(source, createWriteStream(partPath));
      await rename(partPath, finalPath);
    } catch (error) {
      await rm(partPath, { force: true });
      throw error;
    }

    const { size } = await stat(finalPath);
    this.logger.log(
      `Đã tải file ${driveFileId} (${Math.round(size / 1024 / 1024)}MB) xuống cache`,
    );
    return {
      path: finalPath,
      size,
      refCount: 0,
      releasedAt: this.clock.now().getTime(),
    };
  }
}
