import { PublishStatus } from '../../../generated/prisma/client';

/**
 * Tiến độ của một mốc giờ trong ngày đang xem. Chỉ suy ra từ dữ liệu, không ghi DB.
 */
export const SLOT_PROGRESS = [
  'PENDING', // chưa tới giờ, còn bài trong kho
  'RUNNING', // có job đang chờ/đang đăng
  'DONE', // đã đăng đủ số bài kế hoạch
  'PARTIAL', // đăng được một phần rồi dừng
  'FAILED', // có job lỗi và chưa bài nào thành công
  'MISSED', // giờ đã qua mà không có job nào
  'NO_CONTENT', // tới giờ cũng không có bài hợp lệ trong kho
  'PAUSED', // slot tắt / page tắt auto / page tạm dừng
] as const;

export type SlotProgress = (typeof SLOT_PROGRESS)[number];

/** Job đang chạy = chưa ra kết quả cuối. CANCELLED không tính là đang chạy. */
const RUNNING_STATUSES: readonly PublishStatus[] = [
  PublishStatus.SCHEDULED,
  PublishStatus.QUEUED,
  PublishStatus.PUBLISHING,
];

export interface SlotProgressInput {
  /** Số bài kế hoạch của mốc giờ (`postCount`). */
  plannedCount: number;
  /** Trạng thái các job đã tạo cho mốc giờ này trong ngày đang xem. */
  jobStatuses: readonly PublishStatus[];
  /** Số bài trong kho còn dùng được cho mốc giờ này (đếm tại thời điểm hỏi). */
  readyCount: number;
  /** Mốc giờ đã qua so với hiện tại (theo giờ VN). */
  slotPassed: boolean;
  /** Cả 3 điều kiện chạy được: slot bật + page bật auto + page đang hoạt động. */
  runnable: boolean;
}

/**
 * Thứ tự kiểm rất quan trọng: đã có kết quả thật thì kết quả thắng suy đoán.
 * Vd slot đã tắt **sau khi** bot đăng xong thì vẫn phải hiện PAUSED để người dùng
 * hiểu vì sao hôm sau không đăng nữa — nên PAUSED kiểm trước mọi thứ trừ khi
 * đã có job (job có thật thì hiện tiến độ thật).
 */
export function resolveSlotProgress(input: SlotProgressInput): SlotProgress {
  const { plannedCount, jobStatuses, readyCount, slotPassed, runnable } = input;

  const success = jobStatuses.filter((s) => s === PublishStatus.SUCCESS).length;
  const failed = jobStatuses.filter((s) => s === PublishStatus.FAILED).length;
  const running = jobStatuses.filter((s) =>
    RUNNING_STATUSES.includes(s),
  ).length;

  if (jobStatuses.length === 0) {
    if (!runnable) return 'PAUSED';
    if (slotPassed) return 'MISSED';
    if (readyCount === 0) return 'NO_CONTENT';
    return 'PENDING';
  }

  if (running > 0) return 'RUNNING';
  if (success >= plannedCount && plannedCount > 0) return 'DONE';
  if (success > 0) return 'PARTIAL';
  if (failed > 0) return 'FAILED';
  // Chỉ còn CANCELLED — coi như chưa đăng gì.
  if (!runnable) return 'PAUSED';
  return slotPassed ? 'MISSED' : 'PENDING';
}
