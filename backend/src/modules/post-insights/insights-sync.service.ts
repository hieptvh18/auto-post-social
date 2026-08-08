import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { todayInTz } from '../../common/utils/datetime.util';
import { AppConfigService } from '../../config/app-config.service';
import { ClockService } from '../../infra/clock/clock.service';
import { CryptoService } from '../../infra/crypto/crypto.service';
import { FacebookInsightsClient } from '../../infra/facebook/facebook-insights.client';
import type { FacebookInsightTarget } from '../../infra/facebook/facebook-insights.interface';
import { SCOPE_READ_INSIGHTS } from '../facebook-pages/facebook-pages.service';
import {
  PostInsightsRepository,
  type SyncPageTarget,
  type SyncTarget,
} from './post-insights.repository';

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Quá mốc này thì ngừng đồng bộ hẳn — lượt hiển thị của một bài Facebook gần như
 * đứng yên sau vài tuần, quét tiếp chỉ đốt rate limit để nhận lại đúng con số cũ.
 */
const WATCH_WINDOW_DAYS = 30;

/**
 * Bài càng mới thì số càng nhảy nhanh ⇒ quét dày; bài cũ quét thưa dần.
 * Quét đều mọi bài với cùng tần suất là cách nhanh nhất để dính rate limit mà
 * chẳng thu được thông tin gì mới.
 */
const SYNC_TIERS: { maxAgeMs: number; intervalMs: number }[] = [
  { maxAgeMs: 2 * MS_PER_DAY, intervalMs: 6 * MS_PER_HOUR },
  { maxAgeMs: 7 * MS_PER_DAY, intervalMs: 24 * MS_PER_HOUR },
  { maxAgeMs: WATCH_WINDOW_DAYS * MS_PER_DAY, intervalMs: 48 * MS_PER_HOUR },
];

/** Chặn user bấm "Đồng bộ ngay" liên tục làm thay job nền. */
export const MANUAL_SYNC_THROTTLE_MS = 5 * 60 * 1000;

export type SyncSkipReason =
  'NO_DUE_POSTS' | 'MISSING_SCOPE' | 'TOKEN_UNREADABLE' | 'INVALID_METRIC';

export interface PageSyncResult {
  pageId: string;
  dueCount: number;
  updatedCount: number;
  missingCount: number;
  failedCount: number;
  skipReason?: SyncSkipReason;
}

/**
 * Job kéo số liệu Facebook về cho **bài do tool đăng** (plan 25 §0.1).
 *
 * Chạy mỗi 6 tiếng chứ không phải mỗi phút: đây là số liệu Meta cập nhật trễ
 * 15 phút–vài giờ, quét dày hơn không cho số chính xác hơn.
 */
@Injectable()
export class InsightsSyncService {
  private readonly logger = new Logger(InsightsSyncService.name);
  /** pageId → thời điểm đồng bộ tay gần nhất. Chỉ để throttle, mất khi restart là chấp nhận được. */
  private readonly lastManualSync = new Map<string, number>();

  constructor(
    private readonly repository: PostInsightsRepository,
    private readonly insights: FacebookInsightsClient,
    private readonly crypto: CryptoService,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  @Cron('0 */6 * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleCron(): Promise<void> {
    await this.syncAll(this.clock.now());
  }

  /** Tách khỏi `handleCron` để test gọi được với thời điểm giả (rule 01 §Thời gian). */
  async syncAll(now: Date, pageId?: string): Promise<PageSyncResult[]> {
    const windowStart = new Date(
      now.getTime() - WATCH_WINDOW_DAYS * MS_PER_DAY,
    );
    const pages = await this.repository.findSyncCandidates(windowStart, pageId);

    const results: PageSyncResult[] = [];
    for (const page of pages) {
      // Tuần tự và bắt lỗi từng page: một page token hỏng không được làm chết cả lượt.
      results.push(await this.syncPage(page, now));
    }
    return results;
  }

  /**
   * Cho nút "Đồng bộ ngay". Trả `null` khi còn trong cửa sổ throttle — caller
   * biến thành 429, không phải lỗi thật.
   */
  async syncPageOnDemand(pageId: string): Promise<PageSyncResult[] | null> {
    const now = this.clock.now();
    const last = this.lastManualSync.get(pageId);
    if (last !== undefined && now.getTime() - last < MANUAL_SYNC_THROTTLE_MS) {
      return null;
    }

    this.lastManualSync.set(pageId, now.getTime());
    return this.syncAll(now, pageId);
  }

  private async syncPage(
    page: SyncPageTarget,
    now: Date,
  ): Promise<PageSyncResult> {
    const empty: PageSyncResult = {
      pageId: page.pageId,
      dueCount: 0,
      updatedCount: 0,
      missingCount: 0,
      failedCount: 0,
    };

    // Thiếu scope ⇒ bỏ CẢ page, không gọi Graph lần nào. Gửi 50 request chỉ để
    // nhận về 50 lỗi giống hệt nhau là đốt rate limit không đổi lấy gì.
    if (
      page.connectionScopes !== null &&
      !page.connectionScopes.includes(SCOPE_READ_INSIGHTS)
    ) {
      this.logger.warn(
        `Bỏ qua page "${page.pageName}": token thiếu scope ${SCOPE_READ_INSIGHTS}. User cần bấm "Kết nối lại".`,
      );
      return { ...empty, skipReason: 'MISSING_SCOPE' };
    }

    const due = page.posts.filter((post) => isDue(post, now));
    if (due.length === 0) return { ...empty, skipReason: 'NO_DUE_POSTS' };

    let accessToken: string;
    try {
      accessToken = this.crypto.decrypt(page.accessTokenEnc);
    } catch {
      // Đổi TOKEN_ENCRYPTION_KEY là ra ca này. Không để nó làm chết cả lượt quét.
      this.logger.error(
        `Không giải mã được token của page "${page.pageName}" — bỏ qua page này.`,
      );
      return { ...empty, dueCount: due.length, skipReason: 'TOKEN_UNREADABLE' };
    }

    const targets: FacebookInsightTarget[] = due.map((post) => ({
      postId: post.facebookPostId,
      isVideo: post.isVideo,
    }));

    let ok: Awaited<ReturnType<FacebookInsightsClient['getPostInsights']>>;
    try {
      ok = await this.insights.getPostInsights(targets, accessToken);
    } catch (error) {
      this.logger.error(
        `Đồng bộ số liệu page "${page.pageName}" thất bại: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { ...empty, dueCount: due.length, failedCount: due.length };
    }

    // Graph chê TÊN METRIC ⇒ mọi bài của page sẽ hỏng y hệt, và đó là lỗi cấu
    // hình của ta chứ không phải của bài. Dừng cả page, KHÔNG ghi lỗi lên từng
    // dòng — 50 dòng cùng một message chỉ làm nhiễu, che mất nguyên nhân thật.
    if (ok.failed.some((f) => f.isInvalidMetric)) {
      this.logger.error(
        `Ngừng đồng bộ page "${page.pageName}": Facebook không chấp nhận tên metric đang dùng. ` +
          'Xem hằng METRIC_* trong facebook-insights.client.ts và đo lại bằng Graph API Explorer.',
      );
      return { ...empty, dueCount: due.length, skipReason: 'INVALID_METRIC' };
    }

    const byPostId = new Map(due.map((post) => [post.facebookPostId, post]));
    const snapshotDate = todayInTz(now, this.config.timezone);
    let updatedCount = 0;

    for (const insight of ok.ok) {
      const post = byPostId.get(insight.postId);
      if (post === undefined) continue;

      await this.repository.saveInsight(
        {
          assignmentId: post.assignmentId,
          facebookPostId: insight.postId,
          videoViews: insight.videoViews,
          fanReach: insight.fanReach,
          clicks: insight.clicks,
          likeCount: insight.likeCount,
          commentCount: insight.commentCount,
          shareCount: insight.shareCount,
          fetchedAt: now,
        },
        snapshotDate,
      );
      updatedCount += 1;
    }

    let missingCount = 0;
    for (const failure of ok.failed) {
      const post = byPostId.get(failure.postId);
      if (post === undefined) continue;

      if (failure.isMissing) {
        await this.repository.markMissing(
          post.assignmentId,
          failure.postId,
          failure.message,
          now,
        );
        missingCount += 1;
      } else {
        await this.repository.recordSyncError(
          post.assignmentId,
          failure.postId,
          failure.message,
          now,
        );
      }
    }

    return {
      pageId: page.pageId,
      dueCount: due.length,
      updatedCount,
      missingCount,
      failedCount: ok.failed.length - missingCount,
    };
  }
}

/**
 * Bài đã tới hạn quét lại chưa. Chưa đồng bộ lần nào ⇒ luôn tới hạn.
 *
 * Bài già hơn cửa sổ theo dõi không có tier nào khớp ⇒ không bao giờ tới hạn
 * (repository cũng đã lọc sẵn, đây là lớp chặn thứ hai).
 */
export function isDue(post: SyncTarget, now: Date): boolean {
  if (post.fetchedAt === null) return true;

  const ageMs = now.getTime() - post.publishedAt.getTime();
  const tier = SYNC_TIERS.find((t) => ageMs < t.maxAgeMs);
  if (tier === undefined) return false;

  return now.getTime() - post.fetchedAt.getTime() >= tier.intervalMs;
}
