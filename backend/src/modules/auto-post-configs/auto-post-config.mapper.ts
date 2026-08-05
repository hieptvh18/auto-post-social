import type {
  AutoPostSlot,
  SlotMediaType,
  SlotRun,
  SlotRunStatus,
} from '../../../generated/prisma/client';
import type { SlotReadinessResult } from '../auto-post/slot-readiness';
import type { PageWithSlots } from './auto-post-configs.repository';

/** Lần cron gần nhất chạm mốc giờ này (hôm nay) — để admin biết Bot đã làm gì. */
export interface SlotLastRunResponse {
  status: SlotRunStatus;
  runDate: string;
  runTime: string;
  pickedCount: number;
  jobCreatedCount: number;
  skipReason: string | null;
  errorMessage: string | null;
  startedAt: Date;
}

export interface AutoPostSlotResponse {
  id: string;
  pageId: string;
  time: string;
  categories: string[];
  mediaType: SlotMediaType;
  postCount: number;
  /** Số ảnh gom vào 1 bài (album). 1 = mỗi bài 1 ảnh. */
  assetsPerPost: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** Số bài trong kho đăng được cho mốc này (đúng điều kiện picker của Bot). */
  readyCount: number;
  /** `READY` | `NO_ASSIGNMENT` | `NO_MATCH` | `PAUSED` + câu giải thích cho UI. */
  readiness: SlotReadinessResult;
  /** `null` = hôm nay cron chưa chạy mốc này. */
  lastRun: SlotLastRunResponse | null;
}

/** Thông tin phụ do service tính thêm cho mỗi slot (không có trong bảng). */
export interface SlotEnrichment {
  readyCount: number;
  readiness: SlotReadinessResult;
  lastRun: SlotRun | null;
}

export interface AutoPostConfigResponse {
  /** UUID của page trong hệ thống (không phải page id phía Meta). */
  pageId: string;
  pageName: string;
  /** Page id phía Meta — hiển thị cho người dùng đối chiếu. */
  facebookPageId: string;
  /** `autopostEnabled` của page. */
  enabled: boolean;
  /** Page đang tạm dừng thì dù bật auto vẫn không chạy — UI cần biết để cảnh báo. */
  isActive: boolean;
  slots: AutoPostSlotResponse[];
}

export function toAutoPostSlotResponse(
  slot: AutoPostSlot,
  enrichment: SlotEnrichment = EMPTY_ENRICHMENT,
): AutoPostSlotResponse {
  return {
    id: slot.id,
    pageId: slot.facebookPageId,
    time: slot.time,
    categories: slot.categories,
    mediaType: slot.mediaType,
    postCount: slot.postCount,
    assetsPerPost: slot.assetsPerPost,
    enabled: slot.enabled,
    createdAt: slot.createdAt,
    updatedAt: slot.updatedAt,
    readyCount: enrichment.readyCount,
    readiness: enrichment.readiness,
    lastRun: enrichment.lastRun === null ? null : toLastRun(enrichment.lastRun),
  };
}

function toLastRun(run: SlotRun): SlotLastRunResponse {
  return {
    status: run.status,
    runDate: run.runDate,
    runTime: run.runTime,
    pickedCount: run.pickedCount,
    jobCreatedCount: run.jobCreatedCount,
    skipReason: run.skipReason,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
  };
}

/**
 * Mặc định cho các response **sau khi ghi** (POST/PATCH slot): ở đó UI chỉ cần
 * biết cấu hình vừa lưu, không cần đếm kho — lần `GET` kế tiếp sẽ có số thật.
 */
const EMPTY_ENRICHMENT: SlotEnrichment = {
  readyCount: 0,
  readiness: { status: 'READY', message: null },
  lastRun: null,
};

export function toAutoPostConfigResponse(
  page: PageWithSlots,
  enrichments: Map<string, SlotEnrichment> = new Map(),
): AutoPostConfigResponse {
  return {
    pageId: page.id,
    pageName: page.pageName,
    facebookPageId: page.pageId,
    enabled: page.autopostEnabled,
    isActive: page.isActive,
    slots: page.autoPostSlots.map((slot) =>
      toAutoPostSlotResponse(slot, enrichments.get(slot.id)),
    ),
  };
}
