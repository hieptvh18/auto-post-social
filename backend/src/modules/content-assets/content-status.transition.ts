import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ContentStatus } from '../../../generated/prisma/client';

/** Trạng thái chỉ Bot (worker) được đặt — client gửi lên là 422 (docs/03 §5). */
const BOT_ONLY_STATUSES: readonly ContentStatus[] = [
  ContentStatus.PUBLISHING,
  ContentStatus.PUBLISHED,
];

/** Phần patch mà một lần đổi trạng thái sinh ra — service ghi thẳng xuống DB. */
export interface StatusChangePatch {
  status: ContentStatus;
  approvedById: string | null;
  rejectComment: string | null;
}

export interface PlanStatusChangeInput {
  from: ContentStatus;
  to: ContentStatus;
  /** Người bấm duyệt — thành `approved_by` khi chuyển sang APPROVED. */
  actorId: string;
  /** Lý do gửi kèm lần này (có thể không gửi nếu bài đã có lý do cũ). */
  rejectComment?: string;
  /** Lý do đang lưu trong DB. */
  currentRejectComment: string | null;
}

/**
 * Hàm thuần: kiểm ma trận chuyển trạng thái `docs/03-database-design.md` §5 và
 * trả về đúng những field cần ghi. Trả `null` nghĩa là không có gì thay đổi.
 *
 * Người dùng chỉ đi lại giữa 3 trạng thái duyệt (PENDING_REVIEW / APPROVED /
 * REJECTED); mọi đường dính tới PUBLISHING/PUBLISHED là của Bot.
 */
export function planStatusChange(
  input: PlanStatusChangeInput,
): StatusChangePatch | null {
  const { from, to, actorId } = input;

  // Gửi lại đúng trạng thái đang có = no-op, không phải "client tự set". Phải xét
  // trước hai guard dưới, nếu không việc sửa field khác (vd thêm page phân bổ) của
  // bài đã PUBLISHED sẽ ăn 422 oan vì form gửi kèm status hiện tại.
  if (from === to) return null;

  if (BOT_ONLY_STATUSES.includes(to)) {
    throw new UnprocessableEntityException(
      'Trạng thái "Đang đăng"/"Đã đăng" chỉ Bot được đặt',
    );
  }
  if (BOT_ONLY_STATUSES.includes(from)) {
    throw new UnprocessableEntityException(
      'Bài đang đăng hoặc đã đăng — không đổi trạng thái duyệt được nữa',
    );
  }

  if (to === ContentStatus.REJECTED) {
    const comment = input.rejectComment ?? input.currentRejectComment ?? '';
    if (comment.trim() === '') {
      throw new BadRequestException('Nhập lý do không duyệt');
    }
    return { status: to, approvedById: null, rejectComment: comment };
  }

  if (to === ContentStatus.APPROVED) {
    return { status: to, approvedById: actorId, rejectComment: null };
  }

  // Về chờ duyệt: rút cả phê duyệt lẫn lý do cũ cho sạch state.
  return { status: to, approvedById: null, rejectComment: null };
}
