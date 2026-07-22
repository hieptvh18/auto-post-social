import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(config: AppConfigService) {
    const { host, port } = config.redis;
    this.client = new Redis({
      host,
      port,
      maxRetriesPerRequest: null, // BullMQ yêu cầu null
      lazyConnect: true,
    });
    this.client.on('error', (err) =>
      this.logger.error(`Redis lỗi: ${err.message}`),
    );
  }

  getClient(): Redis {
    return this.client;
  }

  /** Ping Redis cho health check readiness. */
  async ping(): Promise<string> {
    return this.client.ping();
  }

  onModuleDestroy(): void {
    // ioredis disconnect() là đồng bộ — không cần await.
    this.client.disconnect();
  }
}
