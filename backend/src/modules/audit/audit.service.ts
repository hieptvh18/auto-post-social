import { Injectable, Logger } from '@nestjs/common';
import {
  AuditRepository,
  type AuditLogWithUser,
  type AuditPagingParams,
  type CreateAuditLogData,
  type FindAuditLogsFilter,
} from './audit.repository';

/** Action name dùng trong audit_logs (docs/05 §8). */
export const AuditAction = {
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  SETTINGS_UPDATE: 'SETTINGS_UPDATE',
  CONTENT_UPLOAD: 'CONTENT_UPLOAD',
  CONTENT_UPDATE: 'CONTENT_UPDATE',
  CONTENT_DELETE: 'CONTENT_DELETE',
  CONTENT_STATUS_CHANGE: 'CONTENT_STATUS_CHANGE',
  CONTENT_ADS_MARK: 'CONTENT_ADS_MARK',
  CONTENT_ASSIGN_PAGE: 'CONTENT_ASSIGN_PAGE',
  /** Ngưng dùng / dùng lại một bài (cột `is_active`, plan 19). */
  CONTENT_ACTIVE_TOGGLE: 'CONTENT_ACTIVE_TOGGLE',
  /** Xoá hàng loạt — ghi **1 dòng cho cả lô**, không 100 dòng lẻ (plan 19 §2.3). */
  CONTENT_BULK_DELETE: 'CONTENT_BULK_DELETE',
  /** Ngưng dùng / dùng lại hàng loạt — cũng 1 dòng cho cả lô. */
  CONTENT_BULK_ACTIVE: 'CONTENT_BULK_ACTIVE',
  PAGE_CREATE: 'PAGE_CREATE',
  PAGE_UPDATE: 'PAGE_UPDATE',
  PAGE_TOKEN_UPDATE: 'PAGE_TOKEN_UPDATE',
  PAGE_DELETE: 'PAGE_DELETE',
  /** Đăng nhập Facebook thành công — lưu 1 kết nối (plan 15). */
  PAGE_CONNECT_FB: 'PAGE_CONNECT_FB',
  /** Ngắt kết nối tài khoản Facebook (xoá user token đã lưu). */
  PAGE_CONNECT_REVOKE: 'PAGE_CONNECT_REVOKE',
  AUTOPOST_CONFIG_UPDATE: 'AUTOPOST_CONFIG_UPDATE',
  AUTOPOST_SLOT_CREATE: 'AUTOPOST_SLOT_CREATE',
  AUTOPOST_SLOT_UPDATE: 'AUTOPOST_SLOT_UPDATE',
  AUTOPOST_SLOT_DELETE: 'AUTOPOST_SLOT_DELETE',
  MANUAL_PUBLISH: 'MANUAL_PUBLISH',
  /** Bot đăng tự động — actor là Bot nên `userId = null`. */
  AUTO_PUBLISH: 'AUTO_PUBLISH',
  /** Người dùng bấm "Đăng lại" cho một job đã hỏng ở màn Lịch đăng bài. */
  PUBLISH_JOB_RETRY: 'PUBLISH_JOB_RETRY',

  // ── Reup (plan 31 §3.1) ────────────────────────────────────────────────
  // MỌI action reup PHẢI bắt đầu bằng `REUP_`. Đây không phải quy ước đặt tên
  // cho đẹp: `AuditService.findMany`/`findActions` lọc RBAC bằng **tiền tố**
  // này. Thêm action reup mà quên tiền tố ⇒ ADMIN nhìn thấy nó (plan 31 §3.2).
  REUP_TOPIC_CREATE: 'REUP_TOPIC_CREATE',
  REUP_TOPIC_UPDATE: 'REUP_TOPIC_UPDATE',
  REUP_TOPIC_DELETE: 'REUP_TOPIC_DELETE',
  /** Cron A chạy xong 1 chủ đề — 1 dòng/chủ đề/ngày, `userId = null` (Bot). */
  REUP_DISCOVER_CRON: 'REUP_DISCOVER_CRON',
  REUP_DISCOVER_MANUAL: 'REUP_DISCOVER_MANUAL',
  REUP_VIDEO_IMPORTED: 'REUP_VIDEO_IMPORTED',
  REUP_VIDEO_FAILED: 'REUP_VIDEO_FAILED',
  REUP_VIDEO_RETRY: 'REUP_VIDEO_RETRY',
  REUP_VIDEO_SKIP: 'REUP_VIDEO_SKIP',
  /** Cron dọn dẹp — **1 dòng cho cả lô**, chỉ ghi khi `deletedCount > 0`. */
  REUP_CLEANUP_CRON: 'REUP_CLEANUP_CRON',
  REUP_CLEANUP_MANUAL: 'REUP_CLEANUP_MANUAL',
  REUP_RESOURCE_DELETE: 'REUP_RESOURCE_DELETE',
} as const;

/**
 * Tiền tố nhóm action chỉ `reup:view` mới xem được. Lọc bằng **tiền tố**, không
 * liệt kê tay từng action — liệt kê tay thì thêm action mới là quên lọc
 * (plan 31 §6 R2).
 */
export const REUP_ACTION_PREFIX = 'REUP_';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly repository: AuditRepository) {}

  /**
   * Ghi audit log. Lỗi ghi log KHÔNG được làm hỏng nghiệp vụ chính —
   * nuốt lỗi và log lại để còn dấu vết điều tra.
   */
  async log(data: CreateAuditLogData): Promise<void> {
    try {
      await this.repository.create(data);
    } catch (error) {
      this.logger.error(
        `Ghi audit log thất bại (${data.action} ${data.resource}): ${
          (error as Error).message
        }`,
      );
    }
  }

  /** Đọc lịch sử thao tác (màn `/audit`, chỉ ADMIN). Luôn phân trang — bảng này chỉ to dần. */
  async findMany(
    filter: FindAuditLogsFilter,
    paging: AuditPagingParams,
  ): Promise<PaginatedAuditLogs> {
    const [items, total] = await Promise.all([
      this.repository.findMany(filter, paging),
      this.repository.countMany(filter),
    ]);
    return { items, total, page: paging.page, pageSize: paging.pageSize };
  }

  findActions(): Promise<string[]> {
    return this.repository.distinctActions();
  }
}

export interface PaginatedAuditLogs {
  items: AuditLogWithUser[];
  total: number;
  page: number;
  pageSize: number;
}
