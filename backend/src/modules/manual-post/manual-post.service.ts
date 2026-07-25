import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Readable } from 'node:stream';
import { MediaType, type ContentAsset } from '../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { DriveStorageFactory } from '../../infra/drive/drive-storage.factory';
import { FacebookPublisherClient } from '../../infra/facebook/facebook-publisher.client';
import type { PublishResult } from '../../infra/facebook/facebook-publisher.interface';
import { FacebookGraphError } from '../../infra/facebook/facebook.errors';
import { AuditAction, AuditService } from '../audit/audit.service';
import { ContentAssetsRepository } from '../content-assets/content-assets.repository';
import { FacebookPagesRepository } from '../facebook-pages/facebook-pages.repository';
import { FacebookPagesService } from '../facebook-pages/facebook-pages.service';
import type { CreateManualPostDto } from './dto/create-manual-post.dto';
import { ManualPostRepository } from './manual-post.repository';

/** Kết quả trả về ngay cho người bấm nút — đăng thủ công là đồng bộ. */
export interface ManualPostResult {
  jobId: string;
  contentAssetId: string;
  pageId: string;
  pageName: string;
  facebookPostId: string;
  publishedAt: Date;
  message: string;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

@Injectable()
export class ManualPostService {
  private readonly logger = new Logger(ManualPostService.name);

  constructor(
    private readonly repository: ManualPostRepository,
    private readonly contentRepository: ContentAssetsRepository,
    private readonly pagesRepository: FacebookPagesRepository,
    private readonly pagesService: FacebookPagesService,
    private readonly driveFactory: DriveStorageFactory,
    private readonly publisher: FacebookPublisherClient,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Đăng ngay một bài lên một page. Không qua cron, không qua queue — dùng để
   * đăng tay và để nghiệm thu đường publish thật trước khi làm engine tự động.
   */
  async publishNow(
    dto: CreateManualPostDto,
    actor: AuthenticatedUser,
  ): Promise<ManualPostResult> {
    const content = await this.contentRepository.findById(dto.contentAssetId);
    if (content === null) {
      throw new NotFoundException('Không tìm thấy bài trong kho nội dung');
    }

    const page = await this.pagesRepository.findById(dto.pageId);
    if (page === null) {
      throw new NotFoundException('Không tìm thấy Facebook Page');
    }
    if (!page.isActive) {
      throw new BadRequestException(
        `Page "${page.pageName}" đang tạm dừng — bật lại ở mục Quản lý Page trước khi đăng`,
      );
    }

    // Rule "mỗi bài chỉ đăng 1 lần trên 1 page" (UNIQUE content × page).
    const assignment = await this.repository.findAssignment(
      content.id,
      page.id,
    );
    if (assignment !== null && assignment.publishedAt !== null) {
      throw new ConflictException(
        `Bài "${content.title}" đã được đăng lên page "${page.pageName}" rồi`,
      );
    }

    const token = await this.pagesService.getDecryptedToken(page.id);
    const message = buildMessage(dto.caption, dto.hashtags);

    const job = await this.repository.createPublishingJob({
      contentAssetId: content.id,
      facebookPageId: page.id,
      caption: dto.caption,
      hashtags: dto.hashtags,
      createdBy: actor.name,
    });

    let published: PublishResult;
    try {
      const buffer = await this.downloadFromDrive(content.driveFileId);
      const input = {
        pageId: page.pageId,
        accessToken: token,
        message,
        file: {
          buffer,
          filename: buildFilename(content),
          mimeType: content.mimeType ?? defaultMime(content.mediaType),
        },
      };

      published =
        content.mediaType === MediaType.video
          ? await this.publisher.publishVideo(input)
          : await this.publisher.publishImage(input);
    } catch (error) {
      const reason = describeError(error);
      await this.repository.markFailed(job.id, reason);
      this.logger.error(
        `Đăng thủ công thất bại: job=${job.id} content=${content.id} page=${page.id} — ${reason}`,
      );
      // 502: lỗi đến từ hệ thống bên ngoài (Facebook/Drive), không phải input sai.
      throw new BadGatewayException(reason);
    }

    const publishedAt = new Date();
    await this.repository.markPublished({
      jobId: job.id,
      contentAssetId: content.id,
      facebookPageId: page.id,
      facebookPostId: published.postId,
      publishedAt,
    });

    await this.auditService.log({
      userId: actor.id,
      action: AuditAction.MANUAL_PUBLISH,
      resource: `publish_job:${job.id}`,
      afterValue: {
        contentAssetId: content.id,
        facebookPageId: page.id,
        facebookPostId: published.postId,
      },
    });

    return {
      jobId: job.id,
      contentAssetId: content.id,
      pageId: page.id,
      pageName: page.pageName,
      facebookPostId: published.postId,
      publishedAt,
      message: `Đã đăng "${content.title}" lên page "${page.pageName}"`,
    };
  }

  private async downloadFromDrive(fileId: string): Promise<Buffer> {
    const storage = await this.driveFactory.get();
    const stream = await storage.createReadStream(fileId);
    return collectStream(stream);
  }
}

/** Hashtag đặt xuống dòng riêng cho dễ đọc trên Facebook. */
function buildMessage(caption: string, hashtags?: string): string {
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
function describeError(error: unknown): string {
  if (error instanceof FacebookGraphError) return error.message;
  if (error instanceof BadRequestException) return error.message;
  if (error instanceof Error && error.message !== '') return error.message;
  return 'Đăng bài thất bại vì lỗi không xác định';
}

async function collectStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks);
}
