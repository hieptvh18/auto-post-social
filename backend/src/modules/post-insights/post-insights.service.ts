import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FacebookPagesRepository } from '../facebook-pages/facebook-pages.repository';
import type { QueryPostInsightsDto } from './dto/query-post-insights.dto';
import { InsightsSyncService } from './insights-sync.service';
import {
  toPostInsightResponse,
  toSummaryResponse,
  type PageInsightsSummaryResponse,
  type PostInsightResponse,
} from './post-insights.mapper';
import { PostInsightsRepository } from './post-insights.repository';

export interface PostInsightsListResponse {
  data: PostInsightResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface SyncNowResponse {
  dueCount: number;
  updatedCount: number;
  missingCount: number;
  failedCount: number;
  skipReason?: string;
}

/**
 * Màn "Thống kê bài đăng" của một page — **chỉ đọc**, trừ nút "Đồng bộ ngay".
 * Không có endpoint nào ở đây được phép đổi bài trên Facebook.
 */
@Injectable()
export class PostInsightsService {
  constructor(
    private readonly repository: PostInsightsRepository,
    private readonly pages: FacebookPagesRepository,
    private readonly sync: InsightsSyncService,
  ) {}

  async findPosts(
    pageId: string,
    query: QueryPostInsightsDto,
  ): Promise<PostInsightsListResponse> {
    await this.assertPageExists(pageId);

    const { data, total } = await this.repository.findPosts({
      pageId,
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
      mediaType: query.mediaType,
    });

    return {
      data: data.map(toPostInsightResponse),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async getSummary(pageId: string): Promise<PageInsightsSummaryResponse> {
    await this.assertPageExists(pageId);
    return toSummaryResponse(await this.repository.getSummary(pageId));
  }

  async syncNow(pageId: string): Promise<SyncNowResponse> {
    await this.assertPageExists(pageId);

    const results = await this.sync.syncPageOnDemand(pageId);
    if (results === null) {
      throw new HttpException(
        'Vừa đồng bộ xong. Số liệu Facebook cập nhật trễ 15 phút–vài giờ nên đợi ít phút rồi thử lại.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // `syncAll(pageId)` chỉ trả tối đa 1 phần tử; page không có bài nào tới hạn
    // thì không có phần tử nào — trả 0 chứ không phải lỗi.
    const result = results[0];
    if (result === undefined) {
      return {
        dueCount: 0,
        updatedCount: 0,
        missingCount: 0,
        failedCount: 0,
        skipReason: 'NO_DUE_POSTS',
      };
    }

    return {
      dueCount: result.dueCount,
      updatedCount: result.updatedCount,
      missingCount: result.missingCount,
      failedCount: result.failedCount,
      skipReason: result.skipReason,
    };
  }

  private async assertPageExists(pageId: string): Promise<void> {
    const page = await this.pages.findById(pageId);
    if (page === null) throw new NotFoundException('Không tìm thấy page');
  }
}
