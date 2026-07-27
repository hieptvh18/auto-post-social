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
} as const;

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
