import type {
  AutoPostSlot,
  SlotMediaType,
} from '../../../generated/prisma/client';
import type { PageWithSlots } from './auto-post-configs.repository';

export interface AutoPostSlotResponse {
  id: string;
  pageId: string;
  time: string;
  categories: string[];
  mediaType: SlotMediaType;
  postCount: number;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
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
): AutoPostSlotResponse {
  return {
    id: slot.id,
    pageId: slot.facebookPageId,
    time: slot.time,
    categories: slot.categories,
    mediaType: slot.mediaType,
    postCount: slot.postCount,
    enabled: slot.enabled,
    createdAt: slot.createdAt,
    updatedAt: slot.updatedAt,
  };
}

export function toAutoPostConfigResponse(
  page: PageWithSlots,
): AutoPostConfigResponse {
  return {
    pageId: page.id,
    pageName: page.pageName,
    facebookPageId: page.pageId,
    enabled: page.autopostEnabled,
    isActive: page.isActive,
    slots: page.autoPostSlots.map(toAutoPostSlotResponse),
  };
}
