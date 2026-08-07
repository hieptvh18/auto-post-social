import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  SlotMediaType,
  type AutoPostSlot,
} from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { todayInTz } from '../../common/utils/datetime.util';
import { AppConfigService } from '../../config/app-config.service';
import { ClockService } from '../../infra/clock/clock.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import { ContentPickerRepository } from '../auto-post/content-picker.repository';
import { resolveSlotReadiness } from '../auto-post/slot-readiness';
import { SlotRunService } from '../auto-post/slot-run.service';
import {
  toAutoPostConfigResponse,
  toAutoPostSlotResponse,
  type AutoPostConfigResponse,
  type AutoPostSlotResponse,
  type SlotEnrichment,
} from './auto-post-config.mapper';
import {
  AutoPostConfigsRepository,
  type PageWithSlots,
} from './auto-post-configs.repository';
import type { CreateAutoPostSlotDto } from './dto/create-auto-post-slot.dto';
import type { UpdateAutoPostConfigDto } from './dto/update-auto-post-config.dto';
import type { UpdateAutoPostSlotDto } from './dto/update-auto-post-slot.dto';

/** PATCH config: cảnh báo (không chặn) khi bật auto mà page chưa có mốc giờ nào. */
export interface UpdateAutoPostConfigResponse extends AutoPostConfigResponse {
  warning: string | null;
}

/** Số bài Bot còn đăng được cho page này, theo từng danh mục. */
export interface CategoryAvailability {
  category: string;
  imageCount: number;
  videoCount: number;
}

/**
 * CRUD cấu hình đăng tự động. **Chỉ cấu hình** — việc chọn bài và đăng thật nằm ở
 * module auto-post engine riêng (plan 07); ở đây không có logic cron/queue nào.
 */
@Injectable()
export class AutoPostConfigsService {
  constructor(
    private readonly repository: AutoPostConfigsRepository,
    private readonly auditService: AuditService,
    private readonly appConfig: AppConfigService,
    private readonly picker: ContentPickerRepository,
    private readonly slotRuns: SlotRunService,
    private readonly clock: ClockService,
  ) {}

  /**
   * Kèm theo cấu hình còn trả **tình trạng kho** của từng mốc giờ và **lần cron
   * chạy gần nhất hôm nay**. Không có hai thứ này thì admin bật auto xong ngồi
   * đợi mà không biết vì sao Bot im lặng (đúng tình huống 2026-07-25: slot đúng
   * giờ nhưng bài chưa được phân bổ page ⇒ SKIPPED/NO_CONTENT).
   */
  async findAllConfigs(): Promise<AutoPostConfigResponse[]> {
    const pages = await this.repository.findPagesWithSlots(true);
    const today = todayInTz(this.clock.now(), this.appConfig.timezone);
    const runs = await this.slotRuns.findByRunDate(today);
    const runBySlotId = new Map(runs.map((run) => [run.slotId, run]));

    const configs: AutoPostConfigResponse[] = [];
    for (const page of pages) {
      const enrichments = new Map<string, SlotEnrichment>();
      // Đếm 1 lần cho cả page: số bài chờ ở page không phụ thuộc mốc giờ.
      const assignedPendingCount = await this.picker.countAssignedPending(
        page.id,
      );

      for (const slot of page.autoPostSlots) {
        const readyCount = await this.picker.countForSlot({
          facebookPageId: page.id,
          categories: slot.categories,
          mediaType: toPickerMediaType(slot.mediaType),
        });
        enrichments.set(slot.id, {
          readyCount,
          readiness: resolveSlotReadiness({
            readyCount,
            assignedPendingCount,
            slotEnabled: slot.enabled,
            pageAutopostEnabled: page.autopostEnabled,
            pageIsActive: page.isActive,
          }),
          lastRun: runBySlotId.get(slot.id) ?? null,
        });
      }
      configs.push(toAutoPostConfigResponse(page, enrichments));
    }
    return configs;
  }

  /**
   * Kho bài của page tách theo danh mục — nguồn cho form "Thêm mốc giờ đăng".
   * Gộp các biến thể chỉ khác hoa/thường hoặc khoảng trắng thừa, y như
   * `ContentAssetsService.findCategorySuggestions`, để một danh mục không hiện
   * hai dòng với hai con số.
   */
  async findCategoryAvailability(
    pageId: string,
  ): Promise<CategoryAvailability[]> {
    await this.getPageOrFail(pageId);
    const rows = await this.picker.countByCategoryForPage(pageId);
    const merged = new Map<string, CategoryAvailability>();

    for (const row of rows) {
      const category = row.category.trim();
      if (category === '') continue;
      const key = category.toLowerCase();
      const entry = merged.get(key);
      if (entry === undefined) {
        merged.set(key, {
          category,
          imageCount: row.imageCount,
          videoCount: row.videoCount,
        });
      } else {
        entry.imageCount += row.imageCount;
        entry.videoCount += row.videoCount;
      }
    }

    return [...merged.values()].sort(
      (a, b) =>
        b.imageCount + b.videoCount - (a.imageCount + a.videoCount) ||
        a.category.localeCompare(b.category),
    );
  }

  async setEnabled(
    pageId: string,
    dto: UpdateAutoPostConfigDto,
    actor: AuthenticatedUser,
  ): Promise<UpdateAutoPostConfigResponse> {
    const page = await this.getPageOrFail(pageId);
    await this.repository.setAutopostEnabled(pageId, dto.enabled);

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.AUTOPOST_CONFIG_UPDATE,
      resource: `facebook_page:${pageId}`,
      beforeValue: { autopostEnabled: page.autopostEnabled },
      afterValue: { autopostEnabled: dto.enabled },
    });

    // Bật auto nhưng chưa có slot ⇒ bot sẽ không bao giờ chạy. Cảnh báo, không chặn:
    // user có thể bật trước rồi thêm mốc giờ sau.
    const warning =
      dto.enabled && page.autoPostSlots.length === 0
        ? 'Page chưa có mốc giờ nào — bot sẽ không đăng cho tới khi thêm mốc giờ'
        : null;

    return {
      ...toAutoPostConfigResponse({ ...page, autopostEnabled: dto.enabled }),
      warning,
    };
  }

  async createSlot(
    pageId: string,
    dto: CreateAutoPostSlotDto,
    actor: AuthenticatedUser,
  ): Promise<AutoPostSlotResponse> {
    await this.getPageOrFail(pageId);
    this.assertPostCountInRange(dto.postCount);

    const duplicate = await this.repository.findSlotByPageAndTime(
      pageId,
      dto.time,
    );
    if (duplicate !== null) {
      throw new ConflictException(
        `Page này đã có mốc giờ ${dto.time} — mỗi mốc giờ chỉ khai báo 1 lần`,
      );
    }

    const slot = await this.repository.createSlot({
      facebookPageId: pageId,
      time: dto.time,
      categories: dto.categories,
      mediaType: dto.mediaType,
      postCount: dto.postCount,
      enabled: dto.enabled,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.AUTOPOST_SLOT_CREATE,
      resource: `auto_post_slot:${slot.id}`,
      afterValue: {
        pageId,
        time: slot.time,
        categories: slot.categories,
        mediaType: slot.mediaType,
        postCount: slot.postCount,
      },
    });

    return toAutoPostSlotResponse(slot);
  }

  async updateSlot(
    slotId: string,
    dto: UpdateAutoPostSlotDto,
    actor: AuthenticatedUser,
  ): Promise<AutoPostSlotResponse> {
    const current = await this.getSlotOrFail(slotId);
    if (dto.postCount !== undefined) {
      this.assertPostCountInRange(dto.postCount);
    }
    if (dto.time !== undefined && dto.time !== current.time) {
      const duplicate = await this.repository.findSlotByPageAndTime(
        current.facebookPageId,
        dto.time,
      );
      if (duplicate !== null) {
        throw new ConflictException(
          `Page này đã có mốc giờ ${dto.time} — mỗi mốc giờ chỉ khai báo 1 lần`,
        );
      }
    }

    const updated = await this.repository.updateSlot(slotId, {
      time: dto.time,
      categories: dto.categories,
      mediaType: dto.mediaType,
      postCount: dto.postCount,
      enabled: dto.enabled,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.AUTOPOST_SLOT_UPDATE,
      resource: `auto_post_slot:${slotId}`,
      beforeValue: {
        time: current.time,
        categories: current.categories,
        mediaType: current.mediaType,
        postCount: current.postCount,
        enabled: current.enabled,
      },
      afterValue: {
        time: updated.time,
        categories: updated.categories,
        mediaType: updated.mediaType,
        postCount: updated.postCount,
        enabled: updated.enabled,
      },
    });

    return toAutoPostSlotResponse(updated);
  }

  /**
   * Xoá slot chỉ ngừng **tạo job mới**. Job đã tạo trước đó độc lập với slot nên
   * vẫn chạy tiếp — đúng như plan 06 §6.
   */
  async removeSlot(slotId: string, actor: AuthenticatedUser): Promise<void> {
    const current = await this.getSlotOrFail(slotId);
    await this.repository.deleteSlot(slotId);

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.AUTOPOST_SLOT_DELETE,
      resource: `auto_post_slot:${slotId}`,
      beforeValue: {
        pageId: current.facebookPageId,
        time: current.time,
        categories: current.categories,
      },
    });
  }

  private assertPostCountInRange(postCount: number): void {
    const max = this.appConfig.autoPost.maxPostPerSlot;
    if (postCount > max) {
      throw new BadRequestException(
        `Số bài mỗi lần đăng tối đa là ${max} (MAX_POST_PER_SLOT)`,
      );
    }
  }

  private async getPageOrFail(pageId: string): Promise<PageWithSlots> {
    const page = await this.repository.findPageById(pageId);
    if (page === null) {
      throw new NotFoundException('Không tìm thấy Facebook Page');
    }
    return page;
  }

  private async getSlotOrFail(slotId: string): Promise<AutoPostSlot> {
    const slot = await this.repository.findSlotById(slotId);
    if (slot === null) {
      throw new NotFoundException('Không tìm thấy mốc giờ đăng');
    }
    return slot;
  }
}

function toPickerMediaType(
  mediaType: SlotMediaType,
): 'image' | 'video' | 'all' {
  if (mediaType === SlotMediaType.image) return 'image';
  if (mediaType === SlotMediaType.video) return 'video';
  return 'all';
}
