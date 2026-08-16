import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  ReupPlatform,
  ReupRunStatus,
  type ReupTopic,
} from '../../../generated/prisma/client';
import { todayInTz } from '../../common/utils/datetime.util';
import { AppConfigService } from '../../config/app-config.service';
import { ClockService } from '../../infra/clock/clock.service';
import {
  DownloaderContractMismatchError,
  DownloaderUnavailableError,
  YoutubeNotConfiguredError,
  YoutubeQuotaExceededError,
} from '../../infra/reup-downloader/reup-downloader.errors';
import {
  REUP_DOWNLOADER,
  type ReupDownloaderPort,
} from '../../infra/reup-downloader/reup-downloader.interface';
import { AuditAction, AuditService } from '../audit/audit.service';
import { SettingsService } from '../settings/settings.service';
import { filterReupCandidates } from './reup-filter';
import {
  ReupRunsRepository,
  ReupSkipReason,
  type ReupSkipReasonValue,
} from './reup-runs.repository';
import {
  buildReupJobOptions,
  REUP_DOWNLOAD_QUEUE,
  YOUTUBE_SEARCH_QUOTA_COST,
  type ReupDownloadJobData,
} from './reup.constants';
import { ReupTopicsRepository } from './reup-topics.repository';
import { ReupVideosRepository } from './reup-videos.repository';

/** Kết quả một lượt quét một chủ đề — dùng cho log và response "Quét ngay". */
export interface ReupDiscoveryResult {
  topicId: string;
  status: ReupRunStatus;
  foundCount: number;
  pickedCount: number;
  skipReason: ReupSkipReasonValue | null;
  /** `false` = lượt quét đã có người khác nhận (chống double-fire). */
  claimed: boolean;
}

/**
 * Cron A — **chỉ TÌM, không tải** (plan 29 §3.1).
 *
 * Tách khỏi việc tải là cố ý: tải video mất vài phút và hay hỏng; nhét vào cron
 * thì một video hỏng kéo sập cả lượt quét của mọi chủ đề, và cron chạy quá lâu
 * sẽ chồng tick.
 */
@Injectable()
export class ReupDiscoveryService {
  private readonly logger = new Logger(ReupDiscoveryService.name);

  constructor(
    private readonly topics: ReupTopicsRepository,
    private readonly videos: ReupVideosRepository,
    private readonly runs: ReupRunsRepository,
    private readonly settings: SettingsService,
    private readonly config: AppConfigService,
    private readonly clock: ClockService,
    private readonly auditService: AuditService,
    @Inject(REUP_DOWNLOADER)
    private readonly downloader: ReupDownloaderPort,
    @InjectQueue(REUP_DOWNLOAD_QUEUE)
    private readonly queue: Queue<ReupDownloadJobData>,
  ) {}

  /** Quét toàn bộ chủ đề đang bật. Gọi từ cron và từ nút "Quét ngay" toàn cục. */
  async discoverAll(actorId: string | null): Promise<ReupDiscoveryResult[]> {
    const activeTopics = await this.topics.findActive();
    if (activeTopics.length === 0) {
      this.logger.debug('Không có chủ đề reup nào đang bật — bỏ qua lượt quét');
      return [];
    }

    const results: ReupDiscoveryResult[] = [];
    for (const topic of activeTopics) {
      // Tuần tự chứ không `Promise.all`: mỗi chủ đề tiêu quota, và cộng dồn
      // quota phải thấy được kết quả của chủ đề chạy trước nó.
      results.push(await this.discoverTopic(topic, actorId));
    }
    return results;
  }

  /**
   * Quét MỘT chủ đề. Toàn bộ luồng nằm trong một `try` lớn: **mọi** lỗi phải
   * được đóng sổ vào `reup_runs`, không được ném ra ngoài module reup (QĐ-6 §2,
   * §6 R8) — ném ra là kéo theo scheduler chung.
   */
  async discoverTopic(
    topic: ReupTopic,
    actorId: string | null,
  ): Promise<ReupDiscoveryResult> {
    const runDate = todayInTz(this.clock.now(), this.config.timezone);

    // CLAIM trước mọi thứ khác: bấm "Quét ngay" 2 lần liên tiếp cùng ngày thì
    // lần thứ hai dừng ngay ở đây, chưa tốn một call API nào.
    const run = await this.runs.claim(topic.id, runDate);
    if (run === null) {
      this.logger.debug(
        `Chủ đề "${topic.name}" đã được quét hôm nay (${runDate}) — bỏ qua`,
      );
      return {
        topicId: topic.id,
        status: ReupRunStatus.SKIPPED,
        foundCount: 0,
        pickedCount: 0,
        skipReason: null,
        claimed: false,
      };
    }

    try {
      const result = await this.runDiscovery(topic, run.id, runDate, actorId);
      return { ...result, topicId: topic.id, claimed: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Quét chủ đề "${topic.name}" lỗi: ${message}`);
      await this.runs.finish(run.id, {
        status: ReupRunStatus.ERROR,
        errorMessage: message,
      });
      return {
        topicId: topic.id,
        status: ReupRunStatus.ERROR,
        foundCount: 0,
        pickedCount: 0,
        skipReason: null,
        claimed: true,
      };
    }
  }

  private async runDiscovery(
    topic: ReupTopic,
    runId: string,
    runDate: string,
    actorId: string | null,
  ): Promise<Omit<ReupDiscoveryResult, 'topicId' | 'claimed'>> {
    const skip = async (
      reason: ReupSkipReasonValue,
    ): Promise<Omit<ReupDiscoveryResult, 'topicId' | 'claimed'>> => {
      await this.runs.finish(runId, {
        status: ReupRunStatus.SKIPPED,
        skipReason: reason,
      });
      return {
        status: ReupRunStatus.SKIPPED,
        foundCount: 0,
        pickedCount: 0,
        skipReason: reason,
      };
    };

    // ── Các cửa chặn, xếp theo thứ tự RẺ TRƯỚC (không gọi API nếu chặn được) ──

    if (topic.platform !== ReupPlatform.YOUTUBE) {
      return skip(ReupSkipReason.PLATFORM_NOT_SUPPORTED);
    }

    // Downloader vắng mặt: log ĐÚNG 1 dòng WARN, không stack trace, không lặp
    // mỗi phút (QĐ-6 §2, §6 R9). Trạng thái xem ở `/reup/runs`, không dựa vào log.
    const availability = await this.downloader.checkAvailability();
    if (!availability.available) {
      this.logger.warn(
        `Bỏ qua chủ đề "${topic.name}": downloader không dùng được (${availability.reason ?? 'không rõ lý do'})`,
      );
      return skip(ReupSkipReason.DOWNLOADER_UNAVAILABLE);
    }

    // Chưa cấu hình key ⇒ KHÔNG gọi API, không spam log.
    const apiKey = await this.settings.getYoutubeApiKey();
    if (apiKey === null) {
      return skip(ReupSkipReason.NOT_CONFIGURED);
    }

    // Quota: chặn TRƯỚC khi gọi, không phải gọi rồi mới ăn 403 (§3.2 bước 5).
    const dailyQuota = await this.settings.getYoutubeDailyQuota();
    const usedToday = await this.runs.sumQuotaUsedOnDate(runDate);
    if (usedToday + YOUTUBE_SEARCH_QUOTA_COST > dailyQuota) {
      this.logger.warn(
        `Bỏ qua chủ đề "${topic.name}": quota YouTube hôm nay đã dùng ${usedToday}/${dailyQuota}`,
      );
      return skip(ReupSkipReason.QUOTA_EXCEEDED);
    }

    // ── Gọi nguồn ────────────────────────────────────────────────────────────

    let candidates;
    try {
      candidates = await this.searchAllKeywords(topic);
    } catch (error) {
      // 3 lỗi này là trạng thái vận hành, không phải sự cố ⇒ SKIPPED có lý do,
      // không phải ERROR kèm stack trace.
      if (error instanceof DownloaderUnavailableError) {
        return skip(ReupSkipReason.DOWNLOADER_UNAVAILABLE);
      }
      if (error instanceof YoutubeNotConfiguredError) {
        return skip(ReupSkipReason.NOT_CONFIGURED);
      }
      if (error instanceof YoutubeQuotaExceededError) {
        return skip(ReupSkipReason.QUOTA_EXCEEDED);
      }
      if (error instanceof DownloaderContractMismatchError) {
        this.logger.error(error.message);
        return skip(ReupSkipReason.CONTRACT_MISMATCH);
      }
      throw error;
    }

    const quotaUsed =
      YOUTUBE_SEARCH_QUOTA_COST * Math.max(1, topic.keywords.length);

    // ── Lọc + chọn ───────────────────────────────────────────────────────────

    const known = await this.videos.findKnownExternalIds(topic.platform);
    const { picked } = filterReupCandidates(candidates, {
      knownExternalIds: known,
      minViewCount: topic.minViewCount,
      minDurationSec: topic.minDurationSec,
      maxDurationSec: topic.maxDurationSec,
      maxAgeDays: topic.maxAgeDays,
      limit: topic.dailyQuota,
      now: this.clock.now(),
    });

    if (picked.length === 0) {
      await this.runs.finish(runId, {
        status: ReupRunStatus.SKIPPED,
        foundCount: candidates.length,
        quotaUsed,
        skipReason: ReupSkipReason.NO_NEW_VIDEO,
      });
      return {
        status: ReupRunStatus.SKIPPED,
        foundCount: candidates.length,
        pickedCount: 0,
        skipReason: ReupSkipReason.NO_NEW_VIDEO,
      };
    }

    // ── Ghi DB + đẩy hàng đợi ────────────────────────────────────────────────

    await this.videos.createMany(
      picked.map((video) => ({
        topicId: topic.id,
        platform: topic.platform,
        externalId: video.externalId,
        sourceUrl: video.sourceUrl,
        title: video.title,
        authorName: video.authorName,
        publishedAt:
          video.publishedAt === null ? null : new Date(video.publishedAt),
        durationSec: video.durationSec,
        viewCount:
          video.viewCount === null ? null : BigInt(Math.trunc(video.viewCount)),
        thumbnailUrl: video.thumbnailUrl,
      })),
    );

    // Đọc lại để lấy `id` thật — `createMany` của Prisma không trả về bản ghi.
    const saved = await this.videos.findByExternalIds(
      topic.platform,
      picked.map((video) => video.externalId),
    );
    // Chỉ đẩy hàng đợi những video của CHÍNH lượt này: `findByExternalIds` có
    // thể trả cả bản ghi cũ nếu `createMany` bỏ qua vì trùng.
    const enqueued = saved.filter((video) => video.topicId === topic.id);
    for (const video of enqueued) {
      await this.queue.add(
        REUP_DOWNLOAD_QUEUE,
        { reupVideoId: video.id },
        buildReupJobOptions(`reup-download-${video.id}`),
      );
    }

    await this.runs.finish(runId, {
      status: ReupRunStatus.DONE,
      foundCount: candidates.length,
      pickedCount: enqueued.length,
      quotaUsed,
    });

    await this.auditService.log({
      userId: actorId,
      action:
        actorId === null
          ? AuditAction.REUP_DISCOVER_CRON
          : AuditAction.REUP_DISCOVER_MANUAL,
      resource: `reup_topic:${topic.id}`,
      afterValue: {
        topicName: topic.name,
        platform: topic.platform,
        status: ReupRunStatus.DONE,
        foundCount: candidates.length,
        pickedCount: enqueued.length,
        skipReason: null,
        quotaUsed,
      },
    });

    this.logger.log(
      `Chủ đề "${topic.name}": tìm ${candidates.length}, chọn ${enqueued.length} video`,
    );

    return {
      status: ReupRunStatus.DONE,
      foundCount: candidates.length,
      pickedCount: enqueued.length,
      skipReason: null,
    };
  }

  /** Gộp kết quả của mọi keyword, khử trùng theo `externalId`. */
  private async searchAllKeywords(topic: ReupTopic) {
    const merged = new Map<
      string,
      Awaited<ReturnType<ReupDownloaderPort['search']>>[number]
    >();

    for (const keyword of topic.keywords) {
      const videos = await this.downloader.search({
        keyword,
        // Lấy dư để còn cái mà lọc — sau bộ lọc mới cắt về `dailyQuota`.
        maxResults: Math.min(50, Math.max(10, topic.dailyQuota * 5)),
        regionCode: topic.regionCode,
        publishedAfterDays: topic.maxAgeDays,
      });
      for (const video of videos) {
        if (!merged.has(video.externalId)) merged.set(video.externalId, video);
      }
    }

    return [...merged.values()];
  }
}
