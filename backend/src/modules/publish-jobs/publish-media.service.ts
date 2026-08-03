import { BadRequestException, Injectable } from '@nestjs/common';
import { MediaType, type ContentAsset } from '../../../generated/prisma/client';
import { FacebookPublisherClient } from '../../infra/facebook/facebook-publisher.client';
import type { PublishResult } from '../../infra/facebook/facebook-publisher.interface';
import { FacebookGraphError } from '../../infra/facebook/facebook.errors';
import { MediaCacheService } from '../../infra/media-cache/media-cache.service';

export interface PublishMediaParams {
  content: ContentAsset;
  /** ID page phía Meta (`facebook_pages.page_id`), không phải uuid nội bộ. */
  pageId: string;
  accessToken: string;
  caption: string;
  hashtags?: string | null;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

/**
 * Đường đăng bài dùng chung cho **đăng tay** (plan 09) và **Bot tự động** (plan 07):
 * tải file từ Drive → chọn đúng endpoint ảnh/video → gọi Graph.
 *
 * Cố tình tách ra một chỗ: hai luồng chỉ khác nhau ở *ai gọi* và *có retry hay
 * không*, còn cách ghép caption và cách đẩy file thì phải giống hệt — để hai bản
 * copy trôi khỏi nhau là loại lỗi rất đắt (sửa một chỗ, quên chỗ kia).
 */
@Injectable()
export class PublishMediaService {
  constructor(
    private readonly mediaCache: MediaCacheService,
    private readonly publisher: FacebookPublisherClient,
  ) {}

  /**
   * Mượn file qua `MediaCacheService` thay vì tự tải: cùng một video phân bổ cho
   * 4 page sinh ra 4 job, trước đây mỗi job tải lại toàn bộ file từ Drive. Giờ
   * job đầu tải, ba job sau dùng lại bản trên đĩa.
   */
  async publish(params: PublishMediaParams): Promise<PublishResult> {
    const { content } = params;

    return this.mediaCache.withLocalFile(content.driveFileId, (file) => {
      const input = {
        pageId: params.pageId,
        accessToken: params.accessToken,
        message: buildMessage(params.caption, params.hashtags),
        file: {
          path: file.path,
          filename: buildFilename(content),
          mimeType: content.mimeType ?? defaultMime(content.mediaType),
        },
      };

      return content.mediaType === MediaType.video
        ? this.publisher.publishVideo(input)
        : this.publisher.publishImage(input);
    });
  }
}

/** Hashtag đặt xuống dòng riêng cho dễ đọc trên Facebook. */
export function buildMessage(
  caption: string,
  hashtags?: string | null,
): string {
  const tags = hashtags?.trim();
  return tags === undefined || tags === '' ? caption : `${caption}\n\n${tags}`;
}

function buildFilename(content: ContentAsset): string {
  const ext =
    (content.mimeType === null
      ? undefined
      : EXTENSION_BY_MIME[content.mimeType]) ??
    (content.mediaType === MediaType.video ? 'mp4' : 'jpg');
  return `${content.id}.${ext}`;
}

function defaultMime(mediaType: MediaType): string {
  return mediaType === MediaType.video ? 'video/mp4' : 'image/jpeg';
}

/** Lỗi domain (Graph/Drive) đã có message tiếng Việt; lỗi lạ thì nói chung chung. */
export function describePublishError(error: unknown): string {
  if (error instanceof FacebookGraphError) return error.message;
  if (error instanceof BadRequestException) return error.message;
  if (error instanceof Error && error.message !== '') return error.message;
  return 'Đăng bài thất bại vì lỗi không xác định';
}
