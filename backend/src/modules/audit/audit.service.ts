import { Injectable, Logger } from '@nestjs/common';
import { AuditRepository, type CreateAuditLogData } from './audit.repository';

/** Action name dùng trong audit_logs (docs/05 §8). */
export const AuditAction = {
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DELETE: 'USER_DELETE',
  SETTINGS_UPDATE: 'SETTINGS_UPDATE',
  CONTENT_UPLOAD: 'CONTENT_UPLOAD',
  CONTENT_UPDATE: 'CONTENT_UPDATE',
  CONTENT_DELETE: 'CONTENT_DELETE',
  PAGE_CREATE: 'PAGE_CREATE',
  PAGE_UPDATE: 'PAGE_UPDATE',
  PAGE_TOKEN_UPDATE: 'PAGE_TOKEN_UPDATE',
  PAGE_DELETE: 'PAGE_DELETE',
  AUTOPOST_CONFIG_UPDATE: 'AUTOPOST_CONFIG_UPDATE',
  AUTOPOST_SLOT_CREATE: 'AUTOPOST_SLOT_CREATE',
  AUTOPOST_SLOT_UPDATE: 'AUTOPOST_SLOT_UPDATE',
  AUTOPOST_SLOT_DELETE: 'AUTOPOST_SLOT_DELETE',
  MANUAL_PUBLISH: 'MANUAL_PUBLISH',
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
}
