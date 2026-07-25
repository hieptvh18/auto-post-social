import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  PublishJobEventType,
  type PublishJobEvent,
} from '../../../generated/prisma/client';
import { PublishJobEventsRepository } from './publish-job-events.repository';

export interface LogEventInput {
  publishJobId: string;
  attemptNo: number;
  event: PublishJobEventType;
  message?: string;
  /** Lỗi gốc (Graph/Drive) để điều tra — sẽ được lọc token trước khi ghi. */
  rawError?: unknown;
}

/** Khoá có giá trị là secret — không bao giờ được nằm trong DB log. */
const SECRET_KEYS = [
  'access_token',
  'accesstoken',
  'authorization',
  'token',
  // 'secret' bắt cả `client_secret` lẫn `clientSecret` — biến thể tên là chỗ dễ lọt nhất.
  'secret',
  'password',
];

const MAX_DEPTH = 4;
const MAX_STRING = 2000;

/**
 * Nhật ký kỹ thuật của publish job (plan 07 §4.3). Khác `AuditService`:
 * ở đây ghi *quá trình kỹ thuật* (thử lần mấy, hỏng ở đâu), không phải ai làm gì.
 */
@Injectable()
export class PublishJobEventsService {
  private readonly logger = new Logger(PublishJobEventsService.name);

  constructor(private readonly repository: PublishJobEventsRepository) {}

  /** Ghi log KHÔNG được làm hỏng nghiệp vụ chính — nuốt lỗi, giữ dấu vết ở app log. */
  async log(input: LogEventInput): Promise<void> {
    try {
      await this.repository.create({
        publishJobId: input.publishJobId,
        attemptNo: input.attemptNo,
        event: input.event,
        message: input.message,
        rawError:
          input.rawError === undefined
            ? undefined
            : sanitizeRawError(input.rawError),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'không rõ';
      this.logger.warn(
        `Không ghi được publish_job_events cho job=${input.publishJobId}: ${reason}`,
      );
    }
  }

  findByJobId(publishJobId: string): Promise<PublishJobEvent[]> {
    return this.repository.findByJobId(publishJobId);
  }
}

/**
 * Biến lỗi bất kỳ thành JSON an toàn để lưu DB: che mọi field secret, cắt chuỗi
 * dài, chặn đệ quy sâu. Token lọt vào cột này là rò rỉ vĩnh viễn nên hàm này
 * có test riêng (rule 02 §Crypto/token).
 */
export function sanitizeRawError(error: unknown): Prisma.InputJsonValue {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: truncate(error.message),
      ...(hasDetails(error)
        ? { details: sanitizeValue(error.details, 1) }
        : {}),
    };
  }
  const value = sanitizeValue(error, 0);
  return value === null ? { message: 'không rõ' } : value;
}

function hasDetails(error: Error): error is Error & { details: unknown } {
  return 'details' in error;
}

function sanitizeValue(value: unknown, depth: number): Prisma.InputJsonValue {
  if (depth > MAX_DEPTH) return '[quá sâu]';
  if (value === null || value === undefined) return null as never;
  if (typeof value === 'string') return truncate(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: truncate(value.message) };
  }
  if (typeof value === 'object') {
    const result: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = isSecretKey(key)
        ? '[đã ẩn]'
        : sanitizeValue(item, depth + 1);
    }
    return result;
  }
  // Còn lại là symbol/function/bigint — không có ý nghĩa khi điều tra lỗi.
  return `[${typeof value}]`;
}

function isSecretKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SECRET_KEYS.some((secret) => lower.includes(secret));
}

function truncate(text: string): string {
  return text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text;
}
