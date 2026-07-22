import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from './env.validation';
import { DriverMode, NodeEnv } from './env.validation';

/**
 * Lối vào DUY NHẤT để đọc cấu hình. Service/controller không gọi process.env (rule 04).
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<EnvVars, true>) {}

  private get<K extends keyof EnvVars>(key: K): EnvVars[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): NodeEnv {
    return this.get('NODE_ENV');
  }

  get isProduction(): boolean {
    return this.nodeEnv === NodeEnv.production;
  }

  get port(): number {
    return this.get('PORT');
  }

  get apiPrefix(): string {
    return this.get('API_PREFIX');
  }

  /** Timezone dùng để so khớp mốc giờ slot auto-post. */
  get timezone(): string {
    return this.get('TZ_DISPLAY');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get redis(): { host: string; port: number } {
    return { host: this.get('REDIS_HOST'), port: this.get('REDIS_PORT') };
  }

  get jwt(): {
    accessSecret: string;
    refreshSecret: string;
    accessExpires: string;
    refreshExpires: string;
  } {
    return {
      accessSecret: this.get('JWT_ACCESS_SECRET'),
      refreshSecret: this.get('JWT_REFRESH_SECRET'),
      accessExpires: this.get('JWT_ACCESS_EXPIRES'),
      refreshExpires: this.get('JWT_REFRESH_EXPIRES'),
    };
  }

  get tokenEncryptionKey(): string {
    return this.get('TOKEN_ENCRYPTION_KEY');
  }

  get drive(): {
    driver: DriverMode;
    serviceAccountJson?: string;
    folderId?: string;
    maxUploadMb: number;
  } {
    return {
      driver: this.get('DRIVE_DRIVER'),
      serviceAccountJson: this.get('GOOGLE_SERVICE_ACCOUNT_JSON'),
      folderId: this.get('GOOGLE_DRIVE_FOLDER_ID'),
      maxUploadMb: this.get('MAX_UPLOAD_MB'),
    };
  }

  get facebook(): {
    driver: DriverMode;
    appId?: string;
    appSecret?: string;
    graphVersion: string;
  } {
    return {
      driver: this.get('FACEBOOK_DRIVER'),
      appId: this.get('META_APP_ID'),
      appSecret: this.get('META_APP_SECRET'),
      graphVersion: this.get('META_GRAPH_API_VERSION'),
    };
  }

  get autoPost(): { enabled: boolean; maxPostPerSlot: number } {
    return {
      enabled: this.get('AUTOPOST_ENABLED'),
      maxPostPerSlot: this.get('MAX_POST_PER_SLOT'),
    };
  }
}
