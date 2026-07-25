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

/** Ảnh nhỏ, người dùng đang chờ trên UI. */
const IMAGE_TIMEOUT_MS = 60_000;
/** Video nặng hơn nhiều — vẫn phải có trần để không treo request mãi. */
const VIDEO_TIMEOUT_MS = 180_000;

@Injectable()
export class FacebookPublisherClient implements FacebookPublisher {
  private readonly logger = new Logger(FacebookPublisherClient.name);

  constructor(private readonly config: AppConfigService) {}

  async publishImage(input: PublishMediaInput): Promise<PublishResult> {
    const form = this.baseForm(input);
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
      IMAGE_TIMEOUT_MS,
    );

    // Edge /photos trả cả `id` (photo) lẫn `post_id` (bài viết) — cần `post_id`.
    return { postId: this.readId(body, ['post_id', 'id']) };
  }

  async publishVideo(input: PublishMediaInput): Promise<PublishResult> {
    const form = this.baseForm(input);
    form.set('description', input.message);

    const body = await this.post(
      `${GRAPH_VIDEO_BASE_URL}/${this.version}/${encodeURIComponent(
        input.pageId,
      )}/videos`,
      form,
      input.accessToken,
      'đăng video lên Page',
      VIDEO_TIMEOUT_MS,
    );

    return { postId: this.readId(body, ['id']) };
  }

  private get version(): string {
    return this.config.facebook.graphVersion;
  }

  private baseForm(input: PublishMediaInput): FormData {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(input.file.buffer)], {
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
