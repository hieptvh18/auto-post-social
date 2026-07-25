import type { UserRole } from '../../../generated/prisma/client';
import type { AuditLogWithUser } from './audit.repository';
import { sanitizeAuditValue } from './sanitize-audit-value';

export interface AuditLogActor {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuditLogResponse {
  id: string;
  action: string;
  resource: string;
  /** `null` = Bot/cron thực hiện (`user_id` trong DB là null). */
  actor: AuditLogActor | null;
  beforeValue: unknown;
  afterValue: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface PaginatedAuditLogsResponse {
  items: AuditLogResponse[];
  total: number;
  page: number;
  pageSize: number;
}

export function toAuditLogResponse(log: AuditLogWithUser): AuditLogResponse {
  return {
    id: log.id,
    action: log.action,
    resource: log.resource,
    actor:
      log.user === null
        ? null
        : {
            id: log.user.id,
            name: log.user.name,
            email: log.user.email,
            role: log.user.role,
          },
    // BẮT BUỘC qua sanitize — JSONB tự do có thể chứa token/secret (plan 13 §3.2c).
    beforeValue: sanitizeAuditValue(log.beforeValue),
    afterValue: sanitizeAuditValue(log.afterValue),
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  };
}
