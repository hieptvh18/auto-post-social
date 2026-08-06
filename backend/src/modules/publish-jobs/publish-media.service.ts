import { BadRequestException, Injectable } from '@nestjs/common';
import {
  MediaType,
  type ContentAsset,
  type ContentAssetFile,
} from '../../../generated/prisma/client';
import { FacebookPublisherClient } from '../../infra/facebook/facebook-publisher.client';
import type {
  PublishFileInput,
  PublishResult,
} from '../../infra/facebook/facebook-publisher.interface';
import { FacebookGraphError } from '../../infra/facebook/facebook.errors';
import { MediaCacheService } from '../../infra/media-cache/media-cache.service';

/** Ảnh phụ ở dạng tối thiểu — chỉ phần mô tả FILE (plan 22). */
export type ExtraFileLike = Pick<
  ContentAssetFile,
  'id' | 'driveFileId' | 'driveUrl' | 'thumbnailUrl' | 'mimeType' | 'fileSize'
>;

/**
 * Ghép record content thành danh sách file để đăng: ảnh đại diện trước, rồi ảnh
 * phụ theo đúng thứ tự đã truyền vào. **Nơi duy nhất** làm việc ghép này — đăng
 * tay và Bot tự động đều đi qua đây, hai bản copy sẽ lệch nhau lúc nào không hay.
 *
 * Ảnh phụ mượn shape `ContentAsset` để publisher xử lý mọi ảnh như nhau. Chỉ
 * những field mô tả *file* được thay (kèm `id` để tên file tạm không đụng nhau);
 * phần mô tả *bài* (`title`, `mediaType`, `caption`, `status`…) giữ nguyên của
 * record chính — một bài chỉ có một caption, không phải N bản copy metadata.
 *
 * ⚠️ `id` của phần tử thứ 2 trở đi là id của **file**, không phải id content —
 * không được dùng để ghi trạng thái vào `content_assets`.
 */
export function toPublishContents(
  primary: ContentAsset,
  extraFiles: ExtraFileLike[] = [],
): ContentAsset[] {
  return [
    primary,
    ...extraFiles.map((file) => ({
      ...primary,
      id: file.id,
      driveFileId: file.driveFileId,
      driveUrl: file.driveUrl,
      thumbnailUrl: file.thumbnailUrl,
      mimeType: file.mimeType,
      fileSize: file.fileSize,
    })),
  ];
}

export interface PublishMediaParams {
  /**
   * File của bài, đúng thứ tự đăng — luôn dựng bằng `toPublishContents()`.
   * 1 phần tử = bài thường (ảnh hoặc video); nhiều phần tử = bài nhiều ảnh (album).
   */
  contents: ContentAsset[];
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
    const [content, ...extras] = params.contents;
    const message = buildMessage(params.caption, params.hashtags);

    if (extras.length > 0) {
      return this.publishAlbum(params, message);
    }

    return this.mediaCache.withLocalFile(content.driveFileId, (file) => {
      const input = {
        pageId: params.pageId,
        accessToken: params.accessToken,
        message,
        file: toPublishFile(content, file),
      };

      return content.mediaType === MediaType.video
        ? this.publisher.publishVideo(input)
        : this.publisher.publishImage(input);
    });
  }

  /**
   * Bài nhiều ảnh. Không tải sẵn cả nhóm rồi mới gọi Graph: đưa cho publisher một
   * hàm mượn file **theo yêu cầu** để nó tải–đẩy–thả từng ảnh một, album 10 ảnh
   * cũng chỉ giữ 1 file trên tay tại mỗi thời điểm.
   */
  private publishAlbum(
    params: PublishMediaParams,
    message: string,
  ): Promise<PublishResult> {
    const contents = params.contents;
    const video = contents.find((c) => c.mediaType === MediaType.video);
    if (video !== undefined) {
      throw new BadRequestException(
        `Bài nhiều tài nguyên chỉ ghép được ảnh — "${video.title}" là video`,
      );
    }

    return this.publisher.publishImageAlbum({
      pageId: params.pageId,
      accessToken: params.accessToken,
      message,
      files: {
        count: contents.length,
        withFile: (index, fn) => {
          const content = contents[index];
          return this.mediaCache.withLocalFile(content.driveFileId, (file) =>
            fn(toPublishFile(content, file)),
          );
        },
      },
    });
  }
}

function toPublishFile(
  content: ContentAsset,
  file: { path: string; size: number },
): PublishFileInput {
  return {
    path: file.path,
    size: file.size,
    filename: buildFilename(content),
    mimeType: content.mimeType ?? defaultMime(content.mediaType),
  };
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
