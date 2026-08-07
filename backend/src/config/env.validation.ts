import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

/** Thư mục cache media mặc định khi không khai trong `.env`. */
const DEFAULT_MEDIA_CACHE_DIR = join(tmpdir(), 'tool-auto-fb-media');

/**
 * Thư mục giữ file đang chờ đẩy lên Drive (plan 23). **Khác** `MEDIA_CACHE_DIR`:
 * thư mục kia bị xoá sạch mỗi lần boot, dùng chung sẽ mất file của job đang chờ.
 */
const DEFAULT_MEDIA_UPLOAD_TMP_DIR = join(tmpdir(), 'tool-auto-fb-upload');

/**
 * Key có mặt trong `.env` nhưng để rỗng ⇒ dùng giá trị mặc định.
 *
 * Phải trả thẳng giá trị mặc định chứ KHÔNG trả `undefined`: `plainToInstance`
 * chạy với `exposeDefaultValues: true` vẫn gán `undefined` đè lên default của
 * class, và `MEDIA_CACHE_DIR=` (đúng như trong `.env.example`) sẽ rơi vào
 * `@IsNotEmpty()` làm app crash lúc boot.
 */
const emptyToDir =
  (fallback: string) =>
  ({ value }: { value: unknown }): unknown =>
    typeof value !== 'string' || value.trim() === '' ? fallback : value;

const emptyToDefaultDir = emptyToDir(DEFAULT_MEDIA_CACHE_DIR);
const emptyToDefaultUploadDir = emptyToDir(DEFAULT_MEDIA_UPLOAD_TMP_DIR);

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
  MAX_UPLOAD_MB = 500;

  /**
   * Tổng thời gian Node cho phép nhận trọn 1 request, kể cả body upload.
   * Mặc định của Node là 300_000 — quá ngắn cho video 300MB từ mạng chậm.
   * `0` = bỏ giới hạn (không khuyến khích: mở đường cho slowloris).
   */
  @Transform(toInt)
  @IsInt()
  @Min(0)
  HTTP_REQUEST_TIMEOUT_MS = 900_000;

  @IsOptional()
  @IsString()
  META_APP_ID?: string;

  @IsOptional()
  @IsString()
  META_APP_SECRET?: string;

  @IsString()
  @IsNotEmpty()
  META_GRAPH_API_VERSION = 'v21.0';

  /** Trần thời gian đẩy 1 ảnh lên Graph. */
  @Transform(toInt)
  @IsInt()
  @Min(1_000)
  FB_IMAGE_TIMEOUT_MS = 60_000;

  /**
   * Trần thời gian đẩy 1 video lên Graph. Đây là deadline TỔNG của request:
   * 180s cũ đòi ≥14 Mbps liên tục mới đẩy nổi 300MB, không đạt thì job hỏng rồi
   * retry — mỗi lần retry lại tải file từ Drive về.
   */
  @Transform(toInt)
  @IsInt()
  @Min(1_000)
  FB_VIDEO_TIMEOUT_MS = 900_000;

  /**
   * Video đi qua Resumable Upload API (start/transfer/finish theo chunk do
   * Facebook điều khiển offset) — số lần thử lại tối đa cho MỖI pha khi lỗi
   * mạng/Graph thoáng qua, trước khi bỏ cuộc và báo job thất bại.
   */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  FB_VIDEO_CHUNK_RETRIES = 3;

  /** Thư mục chứa file media tải từ Drive về để nhiều page dùng chung. */
  @Transform(emptyToDefaultDir)
  @IsString()
  @IsNotEmpty()
  MEDIA_CACHE_DIR = DEFAULT_MEDIA_CACHE_DIR;

  /**
   * Giữ file trong cache bao lâu sau khi job cuối thả tay. Phải đủ dài để các
   * page còn lại của cùng mốc giờ kịp dùng lại (worker chạy tuần tự).
   */
  @Transform(toInt)
  @IsInt()
  @Min(0)
  MEDIA_CACHE_TTL_MS = 600_000;

  /**
   * Nơi giữ file đã nhận từ trình duyệt trong lúc chờ worker đẩy lên Drive
   * (plan 23). KHÔNG dùng chung `MEDIA_CACHE_DIR` — thư mục đó bị xoá sạch mỗi
   * lần boot, job đang chờ sẽ mất file.
   */
  @Transform(emptyToDefaultUploadDir)
  @IsString()
  @IsNotEmpty()
  MEDIA_UPLOAD_TMP_DIR = DEFAULT_MEDIA_UPLOAD_TMP_DIR;

  /**
   * Số file được đẩy lên Drive **đồng thời**. Mỗi job đọc trọn file vào RAM
   * trước khi gọi Drive API ⇒ RAM đỉnh ≈ giá trị này × file lớn nhất.
   */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  MEDIA_UPLOAD_CONCURRENCY = 3;

  /** Giữ file tạm + job đã kết thúc bao lâu (ms) — đủ để bấm "Thử lại". */
  @Transform(toInt)
  @IsInt()
  @Min(0)
  MEDIA_UPLOAD_JOB_RETENTION_MS = 86_400_000;

  /**
   * Trần số job `QUEUED`/`UPLOADING_TO_DRIVE` trên **toàn hệ thống**. Vượt ngưỡng
   * thì từ chối ngay ở Guard, trước khi multer ghi byte nào xuống đĩa.
   */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  MEDIA_UPLOAD_MAX_PENDING_JOBS = 20;

  /**
   * Số lệnh `files.copy` chạy đồng thời khi nhập bài từ link Drive (plan 24).
   * Copy chạy phía server Google — **không** tốn RAM/băng thông của mình, nên
   * để cao hơn `MEDIA_UPLOAD_CONCURRENCY` được.
   */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  DRIVE_IMPORT_CONCURRENCY = 5;

  /** Trần số link nhận trong MỘT lần dán/một request nhập từ Drive. */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  DRIVE_IMPORT_MAX_LINKS_PER_REQUEST = 50;

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
