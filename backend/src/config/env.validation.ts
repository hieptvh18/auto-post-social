import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
  type ValidationError,
} from 'class-validator';
import { Transform } from 'class-transformer';

export enum NodeEnv {
  development = 'development',
  test = 'test',
  production = 'production',
}

/** Chế độ xác thực Google Drive. */
export enum DriveAuthMode {
  /** Service account JSON — chỉ ghi được vào Shared Drive (Google Workspace). */
  service_account = 'service_account',
  /** OAuth2 theo tài khoản user — dùng được với Gmail cá nhân (15GB). */
  oauth2 = 'oauth2',
}

/** '1'/'true'/'yes' -> true. Env luôn là string nên phải ép thủ công. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  const v = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(v)) return true;
  if (['0', 'false', 'no', 'n'].includes(v)) return false;
  return value;
};

const toInt = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string' || value.trim() === '') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
};

export class EnvVars {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.development;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3001;

  @IsString()
  @IsNotEmpty()
  API_PREFIX = 'api';

  @IsString()
  @IsNotEmpty()
  TZ_DISPLAY = 'Asia/Ho_Chi_Minh';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  REDIS_HOST!: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  REDIS_PORT!: number;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_EXPIRES = '15m';

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRES = '7d';

  /** 32 byte hex — AES-256-GCM. Sinh: openssl rand -hex 32 */
  @Matches(/^[0-9a-fA-F]{64}$/, {
    message: 'TOKEN_ENCRYPTION_KEY phải là chuỗi hex 64 ký tự (32 byte)',
  })
  TOKEN_ENCRYPTION_KEY!: string;

  /** Gốc URL backend — dựng redirect_uri cho OAuth Drive. */
  @IsString()
  @IsNotEmpty()
  APP_BASE_URL = 'http://localhost:3001';

  /** Gốc URL frontend — redirect browser về sau OAuth callback. */
  @IsString()
  @IsNotEmpty()
  WEB_BASE_URL = 'http://localhost:5178';

  @IsOptional()
  @IsString()
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;

  @IsOptional()
  @IsString()
  GOOGLE_DRIVE_FOLDER_ID?: string;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  MAX_UPLOAD_MB = 200;

  @IsOptional()
  @IsString()
  META_APP_ID?: string;

  @IsOptional()
  @IsString()
  META_APP_SECRET?: string;

  @IsString()
  @IsNotEmpty()
  META_GRAPH_API_VERSION = 'v21.0';

  @Transform(toBoolean)
  @IsBoolean()
  AUTOPOST_ENABLED = true;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  MAX_POST_PER_SLOT = 20;

  /**
   * Job `PUBLISHING` lâu hơn ngần này phút ⇒ màn Monitor coi là kẹt (worker
   * chết giữa chừng). Chỉ để cảnh báo, không tự sửa trạng thái.
   */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  MONITOR_STUCK_MINUTES = 15;
}

/** Gom lỗi validate thành message nhiều dòng, dễ đọc trong log khởi động. */
export function formatErrors(errors: ValidationError[]): string {
  return errors
    .map(
      (e) =>
        `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
    )
    .join('\n');
}

/**
 * Chạy lúc boot. Thiếu/sai biến bắt buộc => throw, app không khởi động nửa vời.
 */
export function validateEnv(raw: Record<string, unknown>): EnvVars {
  const instance = plainToInstance(EnvVars, raw, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(instance, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    throw new Error(`Cấu hình env không hợp lệ:\n${formatErrors(errors)}`);
  }

  return instance;
}
