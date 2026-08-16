import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import {
  DownloaderContractMismatchError,
  DownloaderUnavailableError,
  YoutubeInvalidApiKeyError,
  YoutubeNotConfiguredError,
  YoutubeQuotaExceededError,
} from '../../infra/reup-downloader/reup-downloader.errors';
import {
  REUP_DOWNLOADER,
  type DownloadedFile,
  type ReupDownloaderPort,
  type ReupVideoCandidate,
} from '../../infra/reup-downloader/reup-downloader.interface';
import type { DebugDownloadDto } from './dto/debug-download.dto';
import type { DebugSearchDto } from './dto/debug-search.dto';

/**
 * Hai công cụ chẩn đoán cầu nối Python (plan 28 §3.4).
 *
 * Tồn tại để nghiệm thu tầng cầu nối **trước khi** dựng cron — không có chúng
 * thì plan 29 phải debug 2 tầng cùng lúc. Giữ lại sau plan 29 vì vẫn hữu ích khi
 * Python hỏng, nhưng gác `reup:manage` và ghi rõ trong Swagger là công cụ chẩn đoán.
 *
 * **Không ghi gì vào DB.** Không `content_assets`, không `publish_jobs`,
 * không `reup_videos` (điều kiện nghiệm thu §5).
 */
@Injectable()
export class ReupDebugService {
  private readonly logger = new Logger(ReupDebugService.name);

  constructor(
    @Inject(REUP_DOWNLOADER)
    private readonly downloader: ReupDownloaderPort,
    private readonly config: AppConfigService,
  ) {}

  async search(dto: DebugSearchDto): Promise<ReupVideoCandidate[]> {
    try {
      return await this.downloader.search({
        keyword: dto.keyword,
        maxResults: dto.max ?? 10,
        regionCode: dto.regionCode ?? 'VN',
        publishedAfterDays: dto.publishedAfterDays ?? 30,
      });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async download(dto: DebugDownloadDto): Promise<DownloadedFile> {
    // Thư mục DUY NHẤT theo lần gọi (cạm bẫy C5): `downloader.py` bỏ qua file đã
    // tồn tại >10KB, nên dùng thư mục chung là lần sau ăn nhầm file lần trước.
    const outDir = join(this.config.reup.tmpDir, `debug-${randomUUID()}`);
    try {
      return await this.downloader.download({ url: dto.url, outDir });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  /**
   * Đổi lỗi domain thành HTTP status **có nghĩa** — điều kiện nghiệm thu §5 đòi
   * "key sai ⇒ INVALID_API_KEY, không phải lỗi 500 chung chung".
   *
   * `DownloaderUnavailableError` log **1 dòng WARN, không stack trace** (QĐ-6 §2):
   * chưa cài downloader là trạng thái bình thường, không phải sự cố cần điều tra.
   */
  private toHttpError(error: unknown): Error {
    if (error instanceof DownloaderUnavailableError) {
      this.logger.warn(`DOWNLOADER_UNAVAILABLE — ${error.message}`);
      return new ServiceUnavailableException(error.message);
    }
    if (error instanceof YoutubeNotConfiguredError) {
      return new UnprocessableEntityException(error.message);
    }
    if (error instanceof YoutubeInvalidApiKeyError) {
      return new UnprocessableEntityException(error.message);
    }
    if (error instanceof YoutubeQuotaExceededError) {
      return new UnprocessableEntityException(error.message);
    }
    if (error instanceof DownloaderContractMismatchError) {
      this.logger.error(error.message);
      return new ServiceUnavailableException(error.message);
    }
    // Lỗi tải thật sự (video bị gỡ, mạng hỏng) — có stack trace vì đáng điều tra.
    this.logger.error(
      `Lỗi downloader: ${error instanceof Error ? error.message : String(error)}`,
    );
    return new BadRequestException(
      error instanceof Error ? error.message : 'Lỗi downloader không xác định',
    );
  }
}
