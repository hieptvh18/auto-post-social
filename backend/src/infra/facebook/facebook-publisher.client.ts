import { openAsBlob } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import type {
  FacebookPublisher,
  PublishMediaInput,
  PublishResult,
} from './facebook-publisher.interface';
import { FacebookGraphError, mapFacebookError } from './facebook.errors';

const GRAPH_BASE_URL = 'https://graph.facebook.com';
/** Video phải đi qua host riêng — `graph.facebook.com` từ chối upload video lớn. */
const GRAPH_VIDEO_BASE_URL = 'https://graph-video.facebook.com';

interface UploadOffsets {
  startOffset: number;
  endOffset: number;
}

interface UploadSession extends UploadOffsets {
  videoId: string;
  uploadSessionId: string;
}

/** Graph trả offset dạng chuỗi số (vd `"start_offset": "0"`), không phải number. */
function toOffset(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseUploadOffsets(body: unknown): UploadOffsets {
  const raw =
    body !== null && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {};
  const startOffset = toOffset(raw.start_offset);
  const endOffset = toOffset(raw.end_offset);

  if (startOffset === undefined || endOffset === undefined) {
    throw new FacebookGraphError(
      'Facebook không trả offset hợp lệ khi tải video theo chunk.',
    );
  }
  return { startOffset, endOffset };
}

function parseUploadSession(body: unknown): UploadSession {
  const raw =
    body !== null && typeof body === 'object'
      ? (body as Record<string, unknown>)
      : {};
  const videoId = typeof raw.video_id === 'string' ? raw.video_id : undefined;
  const uploadSessionId =
    typeof raw.upload_session_id === 'string'
      ? raw.upload_session_id
      : undefined;
  const { startOffset, endOffset } = parseUploadOffsets(body);

  if (videoId === undefined || uploadSessionId === undefined) {
    throw new FacebookGraphError(
      'Facebook không trả đủ thông tin phiên upload video (start) — không xác nhận được bài đã lên hay chưa.',
    );
  }
  return { videoId, uploadSessionId, startOffset, endOffset };
}

/**
 * Chunk đầu chậm hẳn so với trung bình các chunk sau ⇒ nghi bắt tay kết nối
 * lại mỗi request (sửa được trong code). Các chunk đều đặn (chunk đầu ≈ trung
 * bình) ⇒ nhiều khả năng Facebook giới hạn tốc độ cả upload session, không
 * sửa được bằng code (plan 20 §4b).
 */
function describeChunkDurations(durationsMs: number[]): string {
  if (durationsMs.length === 0) return 'chưa gửi chunk nào';

  const [first, ...rest] = durationsMs;
  if (rest.length === 0) return `chunk duy nhất ${first}ms`;

  const restAvg = rest.reduce((sum, ms) => sum + ms, 0) / rest.length;
  const restMin = Math.min(...rest);
  const restMax = Math.max(...rest);
  return (
    `chunk đầu ${first}ms, ${rest.length} chunk sau TB ${restAvg.toFixed(0)}ms ` +
    `(min ${restMin}/max ${restMax})`
  );
}

@Injectable()
export class FacebookPublisherClient implements FacebookPublisher {
  private readonly logger = new Logger(FacebookPublisherClient.name);

  constructor(private readonly config: AppConfigService) {}

  async publishImage(input: PublishMediaInput): Promise<PublishResult> {
    const form = await this.baseForm(input);
    form.set('caption', input.message);
    // `published=true` để ảnh lên tường ngay, không nằm ở dạng unpublished photo.
    form.set('published', 'true');

    const body = await this.post(
      `${GRAPH_BASE_URL}/${this.version}/${encodeURIComponent(
        input.pageId,
      )}/photos`,
      form,
      input.accessToken,
      'đăng ảnh lên Page',
      this.config.facebook.imageTimeoutMs,
    );

    // Edge /photos trả cả `id` (photo) lẫn `post_id` (bài viết) — cần `post_id`.
    return { postId: this.readId(body, ['post_id', 'id']) };
  }

  /**
   * Video đi qua Facebook Resumable Upload API (start → transfer theo chunk do
   * chính Facebook điều khiển offset → finish) thay vì 1 POST duy nhất nạp cả
   * file — cách cũ không ổn định với video lớn/đường truyền chậm, Facebook có
   * thể ngắt giữa chừng và trả lỗi không đọc được (plan 20).
   */
  async publishVideo(input: PublishMediaInput): Promise<PublishResult> {
    const url = `${GRAPH_VIDEO_BASE_URL}/${this.version}/${encodeURIComponent(
      input.pageId,
    )}/videos`;
    const timeoutMs = this.config.facebook.videoTimeoutMs;
    const maxAttempts = this.config.facebook.videoChunkRetries;
    // Đo tốc độ thật (tổng thời lượng + thời lượng riêng từng chunk) — dùng để
    // debug khi user báo upload chậm, xem `describeChunkDurations` (plan 20 §4b).
    const startedAt = Date.now();
    const chunkDurationsMs: number[] = [];

    try {
      const session = await this.withRetry(
        'Khởi tạo upload video (start)',
        maxAttempts,
        () => this.startVideoUpload(url, input, timeoutMs),
      );

      const blob = await openAsBlob(input.file.path, {
        type: input.file.mimeType,
      });
      let start = session.startOffset;
      let end = session.endOffset;

      while (start !== end) {
        const chunk = blob.slice(start, end, input.file.mimeType);
        const chunkStartedAt = Date.now();
        const next = await this.withRetry(
          'Tải video theo chunk (transfer)',
          maxAttempts,
          () =>
            this.transferVideoChunk(
              url,
              input,
              session.uploadSessionId,
              start,
              chunk,
              timeoutMs,
            ),
        );
        chunkDurationsMs.push(Date.now() - chunkStartedAt);

        // Offset không tiến ⇒ dữ liệu hỏng/Graph trả sai — dừng thay vì lặp vô hạn.
        if (next.startOffset <= start) {
          throw new FacebookGraphError(
            'Facebook trả offset không hợp lệ khi tải video theo chunk — dừng để tránh lặp vô hạn.',
          );
        }
        start = next.startOffset;
        end = next.endOffset;
      }

      await this.withRetry('Hoàn tất upload video (finish)', maxAttempts, () =>
        this.finishVideoUpload(url, input, session.uploadSessionId, timeoutMs),
      );

      this.logger.log(
        this.describeUploadTiming(input, startedAt, chunkDurationsMs, 'xong'),
      );
      return { postId: session.videoId };
    } catch (error) {
      this.logger.warn(
        this.describeUploadTiming(input, startedAt, chunkDurationsMs, 'lỗi'),
      );
      throw error;
    }
  }

  /**
   * Log để phân biệt "Facebook giới hạn tốc độ upload session" (thời lượng
   * mỗi chunk đều đặn, kể cả chunk đầu) với "nghẽn do bắt tay kết nối lại mỗi
   * request" (chunk đầu chậm hẳn so với trung bình các chunk sau — nếu kết nối
   * được tái dùng, chunk sau phải nhanh hơn nhiều) — dùng khi debug tốc độ
   * upload chậm (plan 20 §4b).
   */
  private describeUploadTiming(
    input: PublishMediaInput,
    startedAt: number,
    chunkDurationsMs: number[],
    outcome: string,
  ): string {
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const sizeMB = input.file.size / (1024 * 1024);
    const mbps =
      elapsedSec > 0 ? (input.file.size * 8) / (elapsedSec * 1_000_000) : 0;
    return (
      `Đăng video ${outcome}: ${sizeMB.toFixed(1)}MB, ${chunkDurationsMs.length} chunk, ` +
      `${elapsedSec.toFixed(1)}s (~${mbps.toFixed(1)} Mbps) — ` +
      `${describeChunkDurations(chunkDurationsMs)} — page=${input.pageId}`
    );
  }

  private async startVideoUpload(
    url: string,
    input: PublishMediaInput,
    timeoutMs: number,
  ): Promise<UploadSession> {
    const form = new FormData();
    form.set('upload_phase', 'start');
    form.set('file_size', String(input.file.size));

    const body = await this.post(
      url,
      form,
      input.accessToken,
      'khởi tạo upload video (start)',
      timeoutMs,
    );
    return parseUploadSession(body);
  }

  private async transferVideoChunk(
    url: string,
    input: PublishMediaInput,
    uploadSessionId: string,
    startOffset: number,
    chunk: Blob,
    timeoutMs: number,
  ): Promise<UploadOffsets> {
    const form = new FormData();
    form.set('upload_phase', 'transfer');
    form.set('upload_session_id', uploadSessionId);
    form.set('start_offset', String(startOffset));
    form.set('video_file_chunk', chunk, input.file.filename);

    const body = await this.post(
      url,
      form,
      input.accessToken,
      'tải video theo chunk (transfer)',
      timeoutMs,
    );
    return parseUploadOffsets(body);
  }

  private async finishVideoUpload(
    url: string,
    input: PublishMediaInput,
    uploadSessionId: string,
    timeoutMs: number,
  ): Promise<void> {
    const form = new FormData();
    form.set('upload_phase', 'finish');
    form.set('upload_session_id', uploadSessionId);
    form.set('description', input.message);

    const body = await this.post(
      url,
      form,
      input.accessToken,
      'hoàn tất upload video (finish)',
      timeoutMs,
    );
    const raw =
      body !== null && typeof body === 'object'
        ? (body as Record<string, unknown>)
        : {};
    if (raw.success !== true) {
      throw new FacebookGraphError(
        'Facebook báo hoàn tất upload video thất bại — kiểm tra lại trên Page.',
      );
    }
  }

  /**
   * Không delay giữa các lần thử — lỗi mạng/Graph thoáng qua thường tự khỏi
   * ngay, và tránh phải thêm cơ chế fake-timer cho test (rule 02).
   */
  private async withRetry<T>(
    label: string,
    maxAttempts: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxAttempts) {
          this.logger.warn(
            `${label} lỗi lần ${attempt}/${maxAttempts}, thử lại: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
    throw lastError;
  }

  private get version(): string {
    return this.config.facebook.graphVersion;
  }

  /**
   * `openAsBlob` trả Blob **trỏ tới file trên đĩa**, không đọc nội dung vào RAM.
   * undici stream thẳng từ đó khi gửi. Đo thật với video 300MB: cách cũ
   * (`new Blob([new Uint8Array(buffer)])`) đẩy RSS lên 1020MB, cách này giữ ~200MB.
   */
  private async baseForm(input: PublishMediaInput): Promise<FormData> {
    const form = new FormData();
    const blob = await openAsBlob(input.file.path, {
      type: input.file.mimeType,
    });
    form.set('source', blob, input.file.filename);
    return form;
  }

  /** Token đi trong header `Authorization`, không bao giờ trong query string. */
  private async post(
    url: string,
    form: FormData,
    accessToken: string,
    context: string,
    timeoutMs: number,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      this.logger.error(
        `Không gọi được Meta Graph khi ${context}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new FacebookGraphError(
        `Không kết nối được tới Facebook khi ${context}. Kiểm tra mạng của server rồi thử lại.`,
      );
    }

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      mapFacebookError(body, context);
    }
    return body;
  }

  private readId(body: unknown, keys: string[]): string {
    if (body !== null && typeof body === 'object') {
      const raw = body as Record<string, unknown>;
      for (const key of keys) {
        const value = raw[key];
        if (typeof value === 'string' && value !== '') return value;
      }
    }

    // Graph trả 200 nhưng không có id ⇒ không biết bài đã lên hay chưa, phải báo lỗi.
    throw new FacebookGraphError(
      'Facebook không trả về ID bài đăng — không xác nhận được bài đã lên hay chưa. Kiểm tra lại trên Page.',
    );
  }
}
