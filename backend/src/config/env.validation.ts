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

export enum DriverMode {
  real = 'real',
  fake = 'fake',
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
  PORT = 3100;

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

  @IsEnum(DriverMode)
  DRIVE_DRIVER: DriverMode = DriverMode.fake;

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

  @IsEnum(DriverMode)
  FACEBOOK_DRIVER: DriverMode = DriverMode.fake;

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

  // Driver real đòi thêm cấu hình — kiểm tra chéo, class-validator không diễn tả được.
  if (
    instance.DRIVE_DRIVER === DriverMode.real &&
    !instance.GOOGLE_DRIVE_FOLDER_ID
  ) {
    throw new Error(
      'Cấu hình env không hợp lệ:\n  - GOOGLE_DRIVE_FOLDER_ID: bắt buộc khi DRIVE_DRIVER=real',
    );
  }
  if (
    instance.DRIVE_DRIVER === DriverMode.real &&
    !instance.GOOGLE_SERVICE_ACCOUNT_JSON
  ) {
    throw new Error(
      'Cấu hình env không hợp lệ:\n  - GOOGLE_SERVICE_ACCOUNT_JSON: bắt buộc khi DRIVE_DRIVER=real',
    );
  }

  return instance;
}
