import { Injectable } from '@nestjs/common';
import { PublishStatus, type SlotRun } from '../../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';
import {
  dayRangeUtc,
  hasSlotTimePassed,
  timeInTz,
  todayInTz,
} from '../../common/utils/datetime.util';
import { ClockService } from '../../infra/clock/clock.service';
import {
  AutoPostConfigsRepository,
  type PageWithSlots,
} from '../auto-post-configs/auto-post-configs.repository';
import { SlotRunService } from '../auto-post/slot-run.service';
import type { QueryPublishScheduleDto } from './dto/query-publish-schedule.dto';
import {
  BOT_PUBLISHER,
  toScheduleJobResponse,
  toSlotRunSummary,
  type PublishScheduleResponse,
  type PublishScheduleSummary,
  type ScheduleItemResponse,
  type ScheduleJobResponse,
  type SlotRunSummary,
} from './publish-schedule.mapper';
import {
  PublishScheduleRepository,
  type ScheduleJobRow,
} from './publish-schedule.repository';
import { resolveSlotProgress } from './schedule-progress';

const RUNNING_STATUSES: readonly PublishStatus[] = [
  PublishStatus.SCHEDULED,
  PublishStatus.QUEUED,
  PublishStatus.PUBLISHING,
];

/**
 * Màn "Lịch đăng bài" — **chỉ đọc**. Ghép cấu hình mốc giờ (`auto_post_slots`,
 * chính là dữ liệu của trang "Cài đặt đăng bài tự động") với job thực tế trong
 * `publish_jobs` để thấy kế hoạch và tiến độ của mọi page trong một ngày.
 */
@Injectable()
export class PublishScheduleService {
  constructor(
    private readonly repository: PublishScheduleRepository,
    private readonly configsRepository: AutoPostConfigsRepository,
    private readonly slotRuns: SlotRunService,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  async getSchedule(
    query: QueryPublishScheduleDto,
  ): Promise<PublishScheduleResponse> {
    const timezone = this.config.timezone;
    const now = this.clock.now();
    const date = query.date ?? todayInTz(now, timezone);
    const { from, to } = dayRangeUtc(date, timezone);

    const [pages, jobRows, slotRuns] = await Promise.all([
      this.configsRepository.findPagesWithSlots(),
      this.repository.findJobsInRange(from, to, query.pageId),
      this.slotRuns.findByRunDate(date),
    ]);
    // Một slot chạy nhiều lần trong ngày (nhiều mốc giờ khác nhau thì khác slot,
    // nhưng slot bị đổi giờ có thể có 2 dòng) — lấy lần chạy gần nhất.
    const runBySlotId = new Map(slotRuns.map((run) => [run.slotId, run]));

    const visiblePages =
      query.pageId === undefined
        ? pages
        : pages.filter((page) => page.id === query.pageId);

    // Job nào đã gắn vào một slot thì không được đếm lại ở item "ngoài lịch".
    const claimedJobIds = new Set<string>();
    const slotItems = await this.buildSlotItems(
      visiblePages,
      jobRows,
      claimedJobIds,
      date,
      now,
      timezone,
      runBySlotId,
    );
    const looseItems = this.buildLooseItems(
      jobRows.filter((row) => !claimedJobIds.has(row.id)),
      timezone,
    );

    const items = [...slotItems, ...looseItems]
      .map((item) => applyStatusFilter(item, query.status))
      .filter((item): item is ScheduleItemResponse => item !== null)
      .sort(byTimeThenPageName);

    return { date, timezone, summary: summarize(items), items };
  }

  private async buildSlotItems(
    pages: PageWithSlots[],
    jobRows: ScheduleJobRow[],
    claimedJobIds: Set<string>,
    date: string,
    now: Date,
    timezone: string,
    runBySlotId: Map<string, SlotRun>,
  ): Promise<ScheduleItemResponse[]> {
    const items: ScheduleItemResponse[] = [];

    for (const page of pages) {
      for (const slot of page.autoPostSlots) {
        // Ghép theo (page, giờ VN) vì `publish_jobs` không giữ `slot_id`
        // (plan 12 §3.2) — plan 06 đã chặn 2 slot cùng page trùng giờ.
        const rows = jobRows.filter(
          (row) =>
            row.facebookPageId === page.id &&
            row.createdBy === BOT_PUBLISHER &&
            timeInTz(row.scheduleTime, timezone) === slot.time,
        );
        rows.forEach((row) => claimedJobIds.add(row.id));

        const jobs = rows.map(toScheduleJobResponse);
        const runnable = slot.enabled && page.autopostEnabled && page.isActive;
        const readyCount = await this.repository.countReadyForSlot({
          facebookPageId: page.id,
          categories: slot.categories,
          mediaType: slot.mediaType,
        });

        items.push({
          key: `slot:${slot.id}`,
          kind: 'slot',
          time: slot.time,
          slotId: slot.id,
          pageId: page.id,
          facebookPageId: page.pageId,
          pageName: page.pageName,
          pageIsActive: page.isActive,
          autopostEnabled: page.autopostEnabled,
          slotEnabled: slot.enabled,
          categories: slot.categories,
          mediaType: slot.mediaType,
          plannedCount: slot.postCount,
          readyCount,
          progress: resolveSlotProgress({
            plannedCount: slot.postCount,
            jobStatuses: jobs.map((job) => job.status),
            readyCount,
            slotPassed: hasSlotTimePassed(date, slot.time, now, timezone),
            runnable,
          }),
          slotRun: mapSlotRun(runBySlotId.get(slot.id)),
          ...countJobs(jobs),
          publishers: distinctPublishers(jobs),
          jobs,
        });
      }
    }

    return items;
  }

  /**
   * Job không thuộc mốc giờ nào: bài **đăng tay** (plan 09) và job của Bot còn sót
   * lại sau khi slot bị xoá/đổi giờ. Gom theo (page, giờ) để lịch không bị vụn.
   */
  private buildLooseItems(
    rows: ScheduleJobRow[],
    timezone: string,
  ): ScheduleItemResponse[] {
    const groups = new Map<string, ScheduleJobRow[]>();

    for (const row of rows) {
      const time = timeInTz(row.scheduleTime, timezone);
      const kind = row.createdBy === BOT_PUBLISHER ? 'slot' : 'manual';
      const key = `${kind}:${row.facebookPageId}:${time}`;
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [row]);
      else group.push(row);
    }

    return [...groups.entries()].map(([key, group]) => {
      const [first] = group;
      const jobs = group.map(toScheduleJobResponse);
      const counts = countJobs(jobs);

      return {
        key,
        kind: key.startsWith('manual:') ? 'manual' : 'slot',
        time: timeInTz(first.scheduleTime, timezone),
        slotId: null,
        pageId: first.facebookPageId,
        facebookPageId: first.facebookPage.pageId,
        pageName: first.facebookPage.pageName,
        pageIsActive: true,
        autopostEnabled: false,
        slotEnabled: false,
        categories: distinct(group.map((row) => row.contentAsset.category)),
        mediaType: null,
        plannedCount: jobs.length,
        readyCount: null,
        // Đã đăng rồi thì tiến độ đọc thẳng từ job, không suy đoán theo giờ.
        progress: resolveSlotProgress({
          plannedCount: jobs.length,
          jobStatuses: jobs.map((job) => job.status),
          readyCount: 0,
          slotPassed: true,
          runnable: true,
        }),
        slotRun: null,
        ...counts,
        publishers: distinctPublishers(jobs),
        jobs,
      };
    });
  }
}

function mapSlotRun(run: SlotRun | undefined): SlotRunSummary | null {
  return run === undefined ? null : toSlotRunSummary(run);
}

function countJobs(jobs: ScheduleJobResponse[]): {
  successCount: number;
  failedCount: number;
  runningCount: number;
} {
  return {
    successCount: jobs.filter((j) => j.status === PublishStatus.SUCCESS).length,
    failedCount: jobs.filter((j) => j.status === PublishStatus.FAILED).length,
    runningCount: jobs.filter((j) => RUNNING_STATUSES.includes(j.status))
      .length,
  };
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

function distinctPublishers(jobs: ScheduleJobResponse[]): string[] {
  return distinct(jobs.map((job) => job.publishedBy));
}

/**
 * Lọc theo trạng thái job: mốc giờ không còn job nào khớp thì ẩn khỏi lịch —
 * người dùng đang hỏi "job nào FAILED", không phải "lịch trông thế nào".
 */
function applyStatusFilter(
  item: ScheduleItemResponse,
  status?: PublishStatus,
): ScheduleItemResponse | null {
  if (status === undefined) return item;

  const jobs = item.jobs.filter((job) => job.status === status);
  if (jobs.length === 0) return null;

  return {
    ...item,
    jobs,
    ...countJobs(jobs),
    publishers: distinctPublishers(jobs),
  };
}

function byTimeThenPageName(
  a: ScheduleItemResponse,
  b: ScheduleItemResponse,
): number {
  return a.time === b.time
    ? a.pageName.localeCompare(b.pageName)
    : a.time.localeCompare(b.time);
}

function summarize(items: ScheduleItemResponse[]): PublishScheduleSummary {
  const slotItems = items.filter((item) => item.kind === 'slot');

  return {
    plannedPosts: slotItems.reduce((sum, item) => sum + item.plannedCount, 0),
    activeSlots: slotItems.filter(
      (item) => item.slotId !== null && item.progress !== 'PAUSED',
    ).length,
    pagesAutoOn: new Set(
      items.filter((item) => item.autopostEnabled).map((item) => item.pageId),
    ).size,
    successPosts: items.reduce((sum, item) => sum + item.successCount, 0),
    failedPosts: items.reduce((sum, item) => sum + item.failedCount, 0),
    runningPosts: items.reduce((sum, item) => sum + item.runningCount, 0),
    manualPosts: items
      .filter((item) => item.kind === 'manual')
      .reduce((sum, item) => sum + item.jobs.length, 0),
  };
}
