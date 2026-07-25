/**
 * Trả lời câu hỏi của admin: "tới giờ rồi mà sao không đăng gì?".
 *
 * Hàm thuần, không đụng DB — mọi con số đã đếm sẵn ở repository. Tách ra để test
 * được từng nhánh, vì đây là thứ admin đọc để tự sửa cấu hình.
 */
export const SlotReadiness = {
  /** Còn bài, tới giờ là đăng được. */
  READY: 'READY',
  /** Chưa phân bổ bài nào cho page này (hoặc đã đăng hết) — gốc rễ hay gặp nhất. */
  NO_ASSIGNMENT: 'NO_ASSIGNMENT',
  /** Có bài chờ ở page nhưng không khớp danh mục / loại media của mốc giờ. */
  NO_MATCH: 'NO_MATCH',
  /** Mốc giờ hoặc page đang tắt ⇒ Bot không chạy dù kho có bài. */
  PAUSED: 'PAUSED',
} as const;

export type SlotReadinessValue =
  (typeof SlotReadiness)[keyof typeof SlotReadiness];

export interface ResolveReadinessInput {
  /** Bài khớp đúng điều kiện picker của mốc giờ này. */
  readyCount: number;
  /** Bài đã gán page, chưa đăng — không lọc danh mục/loại media. */
  assignedPendingCount: number;
  slotEnabled: boolean;
  pageAutopostEnabled: boolean;
  pageIsActive: boolean;
}

export interface SlotReadinessResult {
  status: SlotReadinessValue;
  /** Câu tiếng Việt hiển thị thẳng lên UI, nói luôn cách sửa. */
  message: string | null;
}

export function resolveSlotReadiness(
  input: ResolveReadinessInput,
): SlotReadinessResult {
  if (!input.pageIsActive) {
    return {
      status: SlotReadiness.PAUSED,
      message: 'Page đang tạm dừng — bật lại ở Quản lý Page thì Bot mới đăng',
    };
  }
  if (!input.pageAutopostEnabled) {
    return {
      status: SlotReadiness.PAUSED,
      message: 'Page đang tắt đăng tự động — bật công tắc Auto của page',
    };
  }
  if (!input.slotEnabled) {
    return {
      status: SlotReadiness.PAUSED,
      message: 'Mốc giờ này đang tắt',
    };
  }
  if (input.readyCount > 0) {
    return { status: SlotReadiness.READY, message: null };
  }
  // Tới đây chắc chắn readyCount = 0 và mốc giờ vẫn đang bật.
  if (input.assignedPendingCount === 0) {
    return {
      status: SlotReadiness.NO_ASSIGNMENT,
      message:
        'Chưa có bài nào được phân bổ cho page này (hoặc đã đăng hết) — vào Quản lý Ảnh/Video Edit, mở bài đã duyệt và chọn page ở mục "Phân bổ page"',
    };
  }
  return {
    status: SlotReadiness.NO_MATCH,
    message: `Page còn ${input.assignedPendingCount} bài chờ đăng nhưng không bài nào khớp danh mục / loại media của mốc giờ này — sửa lại danh mục của mốc giờ hoặc đổi "Dạng" của bài`,
  };
}
