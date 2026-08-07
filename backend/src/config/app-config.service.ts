import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvVars } from './env.validation';
import { NodeEnv } from './env.validation';

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

  /** Xem `common/http/server-timeouts.ts` — quyết định upload file lớn có bị cắt không. */
  get httpRequestTimeoutMs(): number {
    return this.get('HTTP_REQUEST_TIMEOUT_MS');
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

  get appBaseUrl(): string {
    return this.get('APP_BASE_URL');
  }

  get webBaseUrl(): string {
    return this.get('WEB_BASE_URL');
  }

  get drive(): {
    serviceAccountJson?: string;
    folderId?: string;
    maxUploadMb: number;
  } {
    return {
      serviceAccountJson: this.get('GOOGLE_SERVICE_ACCOUNT_JSON'),
      folderId: this.get('GOOGLE_DRIVE_FOLDER_ID'),
      maxUploadMb: this.get('MAX_UPLOAD_MB'),
    };
  }

  get facebook(): {
    appId?: string;
    appSecret?: string;
    graphVersion: string;
    imageTimeoutMs: number;
    videoTimeoutMs: number;
    videoChunkRetries: number;
  } {
    return {
      appId: this.get('META_APP_ID'),
      appSecret: this.get('META_APP_SECRET'),
      graphVersion: this.get('META_GRAPH_API_VERSION'),
      imageTimeoutMs: this.get('FB_IMAGE_TIMEOUT_MS'),
      videoTimeoutMs: this.get('FB_VIDEO_TIMEOUT_MS'),
      videoChunkRetries: this.get('FB_VIDEO_CHUNK_RETRIES'),
    };
  }

  /** Cache file Drive dùng chung giữa các job đăng cùng một video. */
  get mediaCache(): { dir: string; ttlMs: number } {
    return {
      dir: this.get('MEDIA_CACHE_DIR'),
      ttlMs: this.get('MEDIA_CACHE_TTL_MS'),
    };
  }

  /** Hàng đợi đẩy file lên Drive (plan 23) — xem `modules/media-upload-jobs`. */
  get mediaUpload(): {
    tmpDir: string;
    concurrency: number;
    retentionMs: number;
    maxPendingJobs: number;
  } {
    return {
      tmpDir: this.get('MEDIA_UPLOAD_TMP_DIR'),
      concurrency: this.get('MEDIA_UPLOAD_CONCURRENCY'),
      retentionMs: this.get('MEDIA_UPLOAD_JOB_RETENTION_MS'),
      maxPendingJobs: this.get('MEDIA_UPLOAD_MAX_PENDING_JOBS'),
    };
  }

  get autoPost(): { enabled: boolean; maxPostPerSlot: number } {
    return {
      enabled: this.get('AUTOPOST_ENABLED'),
      maxPostPerSlot: this.get('MAX_POST_PER_SLOT'),
    };
  }

  get monitor(): { stuckMinutes: number } {
    return { stuckMinutes: this.get('MONITOR_STUCK_MINUTES') };
  }
}
