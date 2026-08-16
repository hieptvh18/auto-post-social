import { ForbiddenException, Injectable } from '@nestjs/common';
import { SlotRunStatus, UserRole } from '../../../generated/prisma/client';
import { isAdminLevel } from '../../common/permissions';
import { todayInTz } from '../../common/utils/datetime.util';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { AppConfigService } from '../../config/app-config.service';
import { ClockService } from '../../infra/clock/clock.service';
import { AutoPostConfigsService } from '../auto-post-configs/auto-post-configs.service';
import { SlotRunService } from '../auto-post/slot-run.service';
import { MonitorService } from '../monitor/monitor.service';
import {
  fillDateRange,
  resolveDashboardRange,
  type DashboardRange,
} from './dashboard-range';
import { DashboardRepository } from './dashboard.repository';
import {
  AlertCode,
  AlertLevel,
  type DailyChart,
  type DashboardAlert,
  type DashboardHealth,
  type DashboardStats,
  type PostsByPage,
  type TopCategories,
} from './dashboard.types';
import {
  DashboardMediaType,
  DEFAULT_TOP_CATEGORIES_LIMIT,
  type QueryDashboardDto,
  type QueryPostsByPageDto,
  type QueryTopCategoriesDto,
} from './dto/query-dashboard.dto';

/** Token hết hạn trong ngần này ngày ⇒ cảnh báo. Hằng nghiệp vụ, không phải env (rule 04). */
const TOKEN_EXPIRY_WARNING_DAYS = 7;

/** Cửa sổ thời gian của khối "Cần chú ý" — trùng khoảng mặc định của Dashboard. */
const HEALTH_WINDOW_LABEL = '7 ngày qua';

/**
 * Màn "Tổng quan" — **chỉ đọc**, không thao tác gì.
 *
 * Điểm khác mọi service khác: `dashboard:view` cấp cho ADMIN + CONTENT (EDITOR
 * không vào màn này từ 2026-08-07), nên scope
 * dữ liệu phải làm ở đây chứ không phải ở guard. CONTENT ở `/content` vốn chỉ
 * thấy bài của mình; nếu Dashboard trả tổng toàn hệ thống thì đó là rò rỉ ngược
 * (plan 14 §3.4).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly repository: DashboardRepository,
    private readonly monitor: MonitorService,
    private readonly autoPostConfigs: AutoPostConfigsService,
    private readonly slotRuns: SlotRunService,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  async getStats(
    query: QueryDashboardDto,
    actor: AuthenticatedUser,
  ): Promise<DashboardStats> {
    const range = this.resolveRange(query);
    const ownerId = scopeOwnerId(actor);

    const [
      inventory,
      newContent,
      adsVideos,
      jobs,
      publishing,
      pages,
      activeUsers,
    ] = await Promise.all([
      this.repository.countContentInventory(ownerId),
      this.repository.countNewContent(range, ownerId),
      this.repository.countAdsVideos(range, ownerId),
      this.repository.countJobVolume(range, ownerId),
      this.repository.countInFlightJobs(ownerId),
      this.repository.countPages(),
      isAdminLevel(actor.role)
        ? this.repository.countActiveUsers()
        : Promise.resolve(null),
    ]);

    return {
      range: { from: range.from, to: range.to },
      scopedToOwnContent: ownerId !== null,
      inventory,
      production: {
        newContent,
        adsVideos,
        successPosts: jobs.success,
        failedPosts: jobs.failed,
        successRate: successRate(jobs.success, jobs.failed),
      },
      live: {
        publishing,
        activePages: pages.activePages,
        autopostEnabledPages: pages.autopostEnabledPages,
        activeUsers,
      },
    };
  }

  async getDailyChart(
    query: QueryDashboardDto,
    actor: AuthenticatedUser,
  ): Promise<DailyChart> {
    const range = this.resolveRange(query);
    const timezone = this.config.timezone;
    const rows = await this.repository.dailyJobStats(
      range,
      timezone,
      scopeOwnerId(actor),
    );

    return {
      range: { from: range.from, to: range.to },
      items: fillDateRange(range, timezone, rows, (date) => ({
        date,
        success: 0,
        failed: 0,
      })),
    };
  }

  async getPostsByPage(
    query: QueryPostsByPageDto,
    actor: AuthenticatedUser,
  ): Promise<PostsByPage> {
    const range = this.resolveRange(query);
    const mediaType = query.mediaType ?? DashboardMediaType.all;
    const items = await this.repository.postsByPage(
      range,
      mediaType,
      scopeOwnerId(actor),
    );
    return { range: { from: range.from, to: range.to }, items };
  }

  /**
   * Top danh mục đăng thành công nhiều nhất, gộp trên nhiều page (bổ sung
   * 2026-08-05, ngoài `docs/04` §8). Cùng scope RBAC với `production.successPosts`
   * (§3.4 plan 14): CONTENT chỉ thấy danh mục trong bài của chính mình.
   */
  async getTopCategories(
    query: QueryTopCategoriesDto,
    actor: AuthenticatedUser,
  ): Promise<TopCategories> {
    const range = this.resolveRange(query);
    const limit = query.limit ?? DEFAULT_TOP_CATEGORIES_LIMIT;
    const items = await this.repository.topCategoriesBySuccess(
      range,
      limit,
      scopeOwnerId(actor),
    );
    return { range: { from: range.from, to: range.to }, items };
  }

  /**
   * Khối "Cần chú ý". Gom từ những nguồn **đã có sẵn** thay vì tính lại: job kẹt
   * lấy qua `MonitorService`, tình trạng kho lấy qua `AutoPostConfigsService`
   * (cùng hàm `resolveSlotReadiness` mà trang Cài đặt đang dùng) — hai nơi tính
   * ra hai con số khác nhau còn tệ hơn không có cảnh báo nào.
   *
   * Chặn CONTENT: các cảnh báo ở đây là chuyện vận hành toàn hệ thống.
   */
  async getHealth(actor: AuthenticatedUser): Promise<DashboardHealth> {
    if (actor.role === UserRole.CONTENT) {
      throw new ForbiddenException(
        'Bạn không có quyền xem cảnh báo vận hành hệ thống',
      );
    }

    const now = this.clock.now();
    const timezone = this.config.timezone;
    const range = resolveDashboardRange(undefined, undefined, now, timezone);
    const tokenDeadline = new Date(
      now.getTime() + TOKEN_EXPIRY_WARNING_DAYS * 24 * 60 * 60_000,
    );

    const [jobs, queue, configs, runsToday, expiringPages] = await Promise.all([
      this.repository.countJobVolume(range, null),
      this.monitor.getQueueSummary(),
      this.autoPostConfigs.findAllConfigs(),
      this.slotRuns.findByRunDate(todayInTz(now, timezone)),
      // Token là dữ liệu nhạy cảm ⇒ chỉ ADMIN được biết page nào sắp hết hạn.
      isAdminLevel(actor.role)
        ? this.repository.findPagesWithExpiringToken(tokenDeadline)
        : Promise.resolve([]),
    ]);

    const alerts: DashboardAlert[] = [];

    if (jobs.failed > 0) {
      alerts.push({
        level: AlertLevel.error,
        code: AlertCode.FAILED_JOBS,
        count: jobs.failed,
        message: `${jobs.failed} bài đăng thất bại trong ${HEALTH_WINDOW_LABEL}`,
        link: '/failed',
      });
    }

    if (queue.stuck.length > 0) {
      alerts.push({
        level: AlertLevel.error,
        code: AlertCode.STUCK_JOBS,
        count: queue.stuck.length,
        message: `${queue.stuck.length} job kẹt ở trạng thái đang đăng quá ${queue.stuckThresholdMinutes} phút`,
        link: '/queue',
      });
    }

    const missedSlots = runsToday.filter(
      (run) =>
        run.status === SlotRunStatus.SKIPPED ||
        run.status === SlotRunStatus.ERROR,
    ).length;
    if (missedSlots > 0) {
      alerts.push({
        level: AlertLevel.warning,
        code: AlertCode.MISSED_SLOTS,
        count: missedSlots,
        message: `${missedSlots} mốc giờ hôm nay không đăng được bài nào`,
        link: '/timeline',
      });
    }

    // Page đã bật auto nhưng không mốc giờ nào còn bài dùng được ⇒ tới giờ sẽ
    // im lặng bỏ qua. Đây là sự cố hay gặp nhất và khó thấy nhất.
    const emptyPools = configs.filter((config) => {
      if (!config.enabled || !config.isActive) return false;
      const liveSlots = config.slots.filter((slot) => slot.enabled);
      return (
        liveSlots.length > 0 && liveSlots.every((slot) => slot.readyCount === 0)
      );
    }).length;
    if (emptyPools > 0) {
      alerts.push({
        level: AlertLevel.warning,
        code: AlertCode.EMPTY_POOL,
        count: emptyPools,
        message: `${emptyPools} page đã bật đăng tự động nhưng không còn bài dùng được`,
        link: '/auto-post',
      });
    }

    if (expiringPages.length > 0) {
      alerts.push({
        level: AlertLevel.warning,
        code: AlertCode.TOKEN_EXPIRING,
        count: expiringPages.length,
        message: `${expiringPages.length} page có token hết hạn trong ${TOKEN_EXPIRY_WARNING_DAYS} ngày tới`,
        link: '/pages',
      });
    }

    return { checkedAt: now, alerts };
  }

  private resolveRange(query: QueryDashboardDto): DashboardRange {
    return resolveDashboardRange(
      query.from,
      query.to,
      this.clock.now(),
      this.config.timezone,
    );
  }
}

/** `null` = xem toàn hệ thống; ngược lại chỉ bài do chính người đó tạo. */
function scopeOwnerId(actor: AuthenticatedUser): string | null {
  return actor.role === UserRole.CONTENT ? actor.id : null;
}

/**
 * Tỷ lệ thành công trên số job **đã đóng sổ**. Chưa có job nào ⇒ `null` chứ
 * không phải `0`: "chưa chạy bài nào" và "đăng hỏng sạch" là hai chuyện khác nhau.
 */
function successRate(success: number, failed: number): number | null {
  const finished = success + failed;
  if (finished === 0) return null;
  return Math.round((success / finished) * 1000) / 10;
}
