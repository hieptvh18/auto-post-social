import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';
import { AppConfigService } from '../../config/app-config.service';

/**
 * Nơi DUY NHẤT khởi tạo PrismaClient. Repository inject service này;
 * controller/service nghiệp vụ không import trực tiếp (rule 01).
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: AppConfigService) {
    // Prisma 7: kết nối qua driver adapter thay vì datasource url trong schema.
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma đã kết nối database');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Ping DB cho health check readiness. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
