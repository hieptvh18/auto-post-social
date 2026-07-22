import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

export type DependencyStatus = 'ok' | 'down';

export interface LivenessResult {
  status: 'ok';
  uptime: number;
}

export interface ReadinessResult {
  status: 'ok' | 'degraded';
  db: DependencyStatus;
  redis: DependencyStatus;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  liveness(): LivenessResult {
    return { status: 'ok', uptime: Math.floor(process.uptime()) };
  }

  async readiness(): Promise<ReadinessResult> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    const status = db === 'ok' && redis === 'ok' ? 'ok' : 'degraded';
    return { status, db, redis };
  }

  private async checkDb(): Promise<DependencyStatus> {
    try {
      await this.prisma.ping();
      return 'ok';
    } catch (error) {
      this.logger.error(
        `Health check DB thất bại: ${(error as Error).message}`,
      );
      return 'down';
    }
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? 'ok' : 'down';
    } catch (error) {
      this.logger.error(
        `Health check Redis thất bại: ${(error as Error).message}`,
      );
      return 'down';
    }
  }
}
