import { Injectable } from '@nestjs/common';
import type { AuditLog, Prisma, User } from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CreateAuditLogData {
  userId: string | null;
  action: string;
  resource: string;
  beforeValue?: Prisma.InputJsonValue;
  afterValue?: Prisma.InputJsonValue;
  ipAddress?: string;
}

export interface FindAuditLogsFilter {
  action?: string;
  userId?: string;
  /** Khớp **tiền tố** resource, vd `content_asset:` lấy mọi log của kho bài. */
  resource?: string;
  from?: Date;
  to?: Date;
}

export interface AuditPagingParams {
  page: number;
  pageSize: number;
}

/** Log kèm người thực hiện; `user = null` nghĩa là Bot/cron làm (docs/05 §8). */
export type AuditLogWithUser = AuditLog & {
  user: Pick<User, 'id' | 'name' | 'email' | 'role'> | null;
};

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateAuditLogData): Promise<void> {
    await this.prisma.auditLog.create({ data });
  }

  findMany(
    filter: FindAuditLogsFilter,
    paging: AuditPagingParams,
  ): Promise<AuditLogWithUser[]> {
    return this.prisma.auditLog.findMany({
      where: buildAuditWhere(filter),
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (paging.page - 1) * paging.pageSize,
      take: paging.pageSize,
    });
  }

  countMany(filter: FindAuditLogsFilter): Promise<number> {
    return this.prisma.auditLog.count({ where: buildAuditWhere(filter) });
  }

  /** Action **thực sự có** trong DB — UI đổ select từ đây thay vì hardcode lại. */
  async distinctActions(): Promise<string[]> {
    const rows = await this.prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    return rows.map((row) => row.action);
  }
}

/** Một nơi duy nhất dựng điều kiện — `findMany` và `countMany` phải lọc y hệt nhau. */
function buildAuditWhere(
  filter: FindAuditLogsFilter,
): Prisma.AuditLogWhereInput {
  return {
    action: filter.action,
    userId: filter.userId,
    resource:
      filter.resource === undefined || filter.resource === ''
        ? undefined
        : { startsWith: filter.resource },
    createdAt:
      filter.from === undefined && filter.to === undefined
        ? undefined
        : { gte: filter.from, lt: filter.to },
  };
}
