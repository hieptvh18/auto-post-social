import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SlotMediaType } from '../../../generated/prisma/client';
import { timeInTz, todayInTz } from '../../common/utils/datetime.util';
import { AppConfigService } from '../../config/app-config.service';
import { ClockService } from '../../infra/clock/clock.service';
import type { SlotWithPage } from '../auto-post-configs/auto-post-configs.repository';
import { AutoPostConfigsRepository } from '../auto-post-configs/auto-post-configs.repository';
import { PublishJobsService } from '../publish-jobs/publish-jobs.service';
import { ContentPickerRepository } from './content-picker.repository';
import { SkipReason, SlotRunService } from './slot-run.service';

/** Kết quả một lần chạy một slot — dùng cho log và cho endpoint chạy tay. */
export interface RunSlotResult {
  slotId: string;
  claimed: boolean;
  pickedCount: number;
  jobCreatedCount: number;
  skipReason?: string;
}

export interface TickResult {
  runTime: string;
  dueSlotCount: number;
  results: RunSlotResult[];
}

/**
 * Nhịp tim của sản phẩm: mỗi phút kiểm xem có slot nào tới giờ không, có thì
 * chọn bài và xếp hàng đăng. Cron chạy **trong chính process backend** (ADR-002),
 * không phải crontab của OS.
 *
 * Mỗi phút vì `auto_post_slots.time` có độ phân giải phút — khớp `HH:mm` chính
 * xác, không cần cửa sổ dung sai.
 */
@Injectable()
export class AutoPostSchedulerService {
  private readonly logger = new Logger(AutoPostSchedulerService.name);

  constructor(
    private readonly configsRepository: AutoPostConfigsRepository,
    private readonly picker: ContentPickerRepository,
    private readonly slotRuns: SlotRunService,
    private readonly publishJobs: PublishJobsService,
    private readonly clock: ClockService,
    private readonly config: AppConfigService,
  ) {}

  @Cron('* * * * *', { timeZone: 'Asia/Ho_Chi_Minh' })
  async handleCron(): Promise<void> {
    if (!this.config.autoPost.enabled) return;
    await this.tick(this.clock.now());
  }

  /**
   * Một nhịp. Tách khỏi `handleCron` để test gọi được với thời điểm giả và để
   * endpoint "chạy ngay" dùng lại — không bao giờ test bằng giờ chạy thật.
   */
  async tick(now: Date): Promise<TickResult> {
    const timezone = this.config.timezone;
    const runTime = timeInTz(now, timezone);
    const runDate = todayInTz(now, timezone);
    const slots = await this.configsRepository.findDueSlots(runTime);

    const results: RunSlotResult[] = [];
    for (const slot of slots) {
      // Tuần tự và bắt lỗi từng slot: một page hỏng không được làm chết cả nhịp.
      results.push(await this.runSlot(slot, runDate, runTime, now));
    }

    if (slots.length > 0) {
      this.logger.log(
        `Tick ${runDate} ${runTime}: ${slots.length} slot tới giờ, tạo ${countJobs(results)} job`,
      );
    }
    return { runTime, dueSlotCount: slots.length, results };
  }

  /**
   * Chạy lại **một** mốc giờ ngay bây giờ, không cần trùng phút — dùng cho nút
   * "Chạy lại mốc này" ở màn Lịch đăng bài khi Bot đã bỏ qua mốc đó (backend
   * không chạy đúng lúc, hoặc lúc đó kho hết bài mà giờ đã có bài mới).
   *
   * Vẫn đi qua `slot_runs` claim theo phút hiện tại nên bấm liên tục trong cùng
   * một phút chỉ chạy một lần; picker cũng đã loại bài đang có job chờ đăng.
   */
  async runSlotNow(slotId: string): Promise<RunSlotResult> {
    const slot = await this.configsRepository.findSlotWithPage(slotId);
    if (slot === null) {
      throw new NotFoundException('Không tìm thấy mốc giờ này');
    }
    const page = slot.facebookPage;
    if (page.deletedAt !== null) {
      throw new BadRequestException(`Page "${page.pageName}" đã bị xoá`);
    }
    if (!page.isActive) {
      throw new BadRequestException(
        `Page "${page.pageName}" đang tạm dừng — bật lại ở mục Quản lý Page trước khi chạy`,
      );
    }
    if (!page.autopostEnabled) {
      throw new BadRequestException(
        `Page "${page.pageName}" đang tắt đăng tự động — bật lại ở Cài đặt đăng bài tự động`,
      );
    }
    if (!slot.enabled) {
      throw new BadRequestException(
        `Mốc giờ ${slot.time} đang tắt — bật lại rồi hãy chạy`,
      );
    }

    const now = this.clock.now();
    const timezone = this.config.timezone;
    return this.runSlot(
      slot,
      todayInTz(now, timezone),
      timeInTz(now, timezone),
      now,
    );
  }

  private async runSlot(
    slot: SlotWithPage,
    runDate: string,
    runTime: string,
    now: Date,
  ): Promise<RunSlotResult> {
    const slotRun = await this.slotRuns.claim(slot.id, runDate, runTime);
    if (slotRun === null) {
      // Phút này đã chạy rồi (tick trùng, restart trong cùng phút, hai process).
      return {
        slotId: slot.id,
        claimed: false,
        pickedCount: 0,
        jobCreatedCount: 0,
      };
    }

    try {
      // Album (plan 21): mỗi bài gom `assetsPerPost` ảnh ⇒ lấy đủ cho cả
      // `postCount` bài rồi mới cắt nhóm.
      const assetsPerPost =
        Number.isInteger(slot.assetsPerPost) && slot.assetsPerPost > 1
          ? slot.assetsPerPost
          : 1;
      const contents = await this.picker.pickForSlot({
        facebookPageId: slot.facebookPageId,
        categories: slot.categories,
        mediaType: toPickerMediaType(slot.mediaType),
        limit: slot.postCount * assetsPerPost,
      });

      if (contents.length === 0) {
        await this.slotRuns.finishSkipped(slotRun.id, SkipReason.NO_CONTENT);
        this.logger.warn(
          `Slot ${slot.id} (${runTime}, page "${slot.facebookPage.pageName}") không còn bài phù hợp`,
        );
        return {
          slotId: slot.id,
          claimed: true,
          pickedCount: 0,
          jobCreatedCount: 0,
          skipReason: SkipReason.NO_CONTENT,
        };
      }

      let jobCreatedCount = 0;
      for (const group of chunk(contents, assetsPerPost)) {
        // Caption/hashtag của bài lấy theo ảnh đầu nhóm — album chỉ có một message.
        const [first] = group;
        try {
          await this.publishJobs.createQueuedJob({
            contentAssetId: first.id,
            extraContentAssetIds: group.slice(1).map((content) => content.id),
            facebookPageId: slot.facebookPageId,
            caption: first.caption,
            hashtags: first.hashtags,
            scheduleTime: now,
          });
          jobCreatedCount += 1;
        } catch (error) {
          // Một bài hỏng thì vẫn cố xếp hàng các bài còn lại của slot.
          this.logger.error(
            `Không tạo được job cho content=${first.id} slot=${slot.id}: ${describe(error)}`,
          );
        }
      }

      await this.slotRuns.finishDone(
        slotRun.id,
        contents.length,
        jobCreatedCount,
      );
      return {
        slotId: slot.id,
        claimed: true,
        pickedCount: contents.length,
        jobCreatedCount,
      };
    } catch (error) {
      const reason = describe(error);
      await this.slotRuns.finishError(slotRun.id, reason);
      this.logger.error(`Slot ${slot.id} chạy lỗi: ${reason}`);
      return {
        slotId: slot.id,
        claimed: true,
        pickedCount: 0,
        jobCreatedCount: 0,
        skipReason: 'ERROR',
      };
    }
  }
}

/**
 * Cắt danh sách đã sắp thứ tự thành từng nhóm `size` phần tử. Nhóm cuối thiếu
 * **vẫn được trả về**: còn 2 ảnh mà cấu hình 5 ảnh/bài thì đăng bài 2 ảnh, hơn là
 * bỏ lại 2 ảnh nằm im tới lần chạy sau.
 */
function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    groups.push(items.slice(i, i + size));
  }
  return groups;
}

function toPickerMediaType(
  mediaType: SlotMediaType,
): 'image' | 'video' | 'all' {
  if (mediaType === SlotMediaType.image) return 'image';
  if (mediaType === SlotMediaType.video) return 'video';
  return 'all';
}

function countJobs(results: RunSlotResult[]): number {
  return results.reduce((sum, result) => sum + result.jobCreatedCount, 0);
}

function describe(error: unknown): string {
  return error instanceof Error && error.message !== ''
    ? error.message
    : 'Lỗi không xác định';
}
