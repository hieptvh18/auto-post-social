import { Injectable } from '@nestjs/common';
import type { MediaType, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Cột sắp xếp được trên màn thống kê. Mặc định là `publishedAt` giảm dần. */
export const INSIGHT_SORT_FIELDS = [
  'publishedAt',
  'videoViews',
  'fanReach',
  'clicks',
] as const;
export type InsightSortField = (typeof INSIGHT_SORT_FIELDS)[number];
export type SortDirection = 'asc' | 'desc';

export interface FindPostsParams {
  pageId: string;
  page: number;
  limit: number;
  sortBy: InsightSortField;
  sortDir: SortDirection;
  mediaType?: MediaType;
}

/** Một bài đã đăng kèm số liệu. `insight === null` = **chưa đồng bộ lần nào**. */
export interface PostInsightRow {
  id: string;
  contentAssetId: string;
  facebookPostId: string | null;
  publishedAt: Date | null;
  contentAsset: {
    title: string;
    mediaType: MediaType;
    thumbnailUrl: string | null;
  };
  insight: {
    videoViews: number | null;
    fanReach: number | null;
    clicks: number | null;
    likeCount: number | null;
    commentCount: number | null;
    shareCount: number | null;
    fetchedAt: Date | null;
    missingOnFbAt: Date | null;
    syncErrorMessage: string | null;
  } | null;
}

/** Bài cần đồng bộ, kèm đủ thứ để gọi Graph mà không phải query thêm. */
export interface SyncTarget {
  assignmentId: string;
  facebookPostId: string;
  publishedAt: Date;
  isVideo: boolean;
  /** Lần đồng bộ thành công gần nhất — `null` = chưa bao giờ. */
  fetchedAt: Date | null;
}

export interface SyncPageTarget {
  pageId: string;
  pageName: string;
  accessTokenEnc: string;
  /** Scope của kết nối; `null` = page dán token tay, không biết scope. */
  connectionScopes: string[] | null;
  posts: SyncTarget[];
}

export interface UpsertInsightData {
  assignmentId: string;
  facebookPostId: string;
  videoViews: number | null;
  fanReach: number | null;
  clicks: number | null;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  fetchedAt: Date;
}

export interface PageInsightsSummary {
  postCount: number;
  syncedCount: number;
  totalVideoViews: number;
  totalFanReach: number;
  totalClicks: number;
  lastFetchedAt: Date | null;
}

const SELECT_ROW = {
  id: true,
  contentAssetId: true,
  facebookPostId: true,
  publishedAt: true,
  contentAsset: {
    select: { title: true, mediaType: true, thumbnailUrl: true },
  },
  insight: {
    select: {
      videoViews: true,
      fanReach: true,
      clicks: true,
      likeCount: true,
      commentCount: true,
      shareCount: true,
      fetchedAt: true,
      missingOnFbAt: true,
      syncErrorMessage: true,
    },
  },
} satisfies Prisma.ContentPageAssignmentSelect;

/** Nơi duy nhất viết Prisma query cho `post_insights` + `post_insight_snapshots`. */
@Injectable()
export class PostInsightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Bài **do tool đăng** lên một page (plan 25 §0.1). Điều kiện `facebookPostId`
   * khác null là thứ phân biệt "đã lên Facebook" với "mới gán page, chưa đăng".
   */
  async findPosts(
    params: FindPostsParams,
  ): Promise<{ data: PostInsightRow[]; total: number }> {
    const where: Prisma.ContentPageAssignmentWhereInput = {
      facebookPageId: params.pageId,
      publishedAt: { not: null },
      facebookPostId: { not: null },
      ...(params.mediaType === undefined
        ? {}
        : { contentAsset: { mediaType: params.mediaType } }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contentPageAssignment.findMany({
        where,
        select: SELECT_ROW,
        orderBy: buildOrderBy(params.sortBy, params.sortDir),
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      this.prisma.contentPageAssignment.count({ where }),
    ]);

    return { data, total };
  }

  async getSummary(pageId: string): Promise<PageInsightsSummary> {
    const where: Prisma.ContentPageAssignmentWhereInput = {
      facebookPageId: pageId,
      publishedAt: { not: null },
      facebookPostId: { not: null },
    };

    const [postCount, aggregate, latest] = await this.prisma.$transaction([
      this.prisma.contentPageAssignment.count({ where }),
      this.prisma.postInsight.aggregate({
        where: { assignment: where },
        _sum: { videoViews: true, fanReach: true, clicks: true },
        _count: { _all: true },
      }),
      this.prisma.postInsight.findFirst({
        where: { assignment: where },
        orderBy: { fetchedAt: 'desc' },
        select: { fetchedAt: true },
      }),
    ]);

    return {
      postCount,
      syncedCount: aggregate._count._all,
      totalVideoViews: aggregate._sum.videoViews ?? 0,
      totalFanReach: aggregate._sum.fanReach ?? 0,
      totalClicks: aggregate._sum.clicks ?? 0,
      lastFetchedAt: latest?.fetchedAt ?? null,
    };
  }

  /**
   * Ứng viên đồng bộ, gom sẵn theo page.
   *
   * Lọc ở tầng SQL đúng những điều kiện **tuyệt đối** (đã đăng, page còn sống,
   * bài chưa bị xoá trên FB, trong cửa sổ theo dõi). Luật "bài mới quét dày, bài
   * cũ quét thưa" **cố ý không** nằm ở đây mà ở service — nó phụ thuộc "bây giờ",
   * và logic phụ thuộc thời gian phải test được bằng clock giả (rule 01 §Thời gian).
   *
   * Page `is_active = false` (tạm dừng đăng) **vẫn** được đồng bộ: dừng đăng bài
   * mới không có nghĩa là thôi theo dõi bài cũ.
   */
  async findSyncCandidates(
    watchWindowStart: Date,
    pageId?: string,
  ): Promise<SyncPageTarget[]> {
    const rows = await this.prisma.contentPageAssignment.findMany({
      where: {
        publishedAt: { not: null, gte: watchWindowStart },
        facebookPostId: { not: null },
        facebookPage: {
          deletedAt: null,
          ...(pageId === undefined ? {} : { id: pageId }),
        },
        // Chưa đồng bộ lần nào, HOẶC đã đồng bộ nhưng bài vẫn còn trên Facebook.
        OR: [{ insight: { is: null } }, { insight: { missingOnFbAt: null } }],
      },
      select: {
        id: true,
        publishedAt: true,
        facebookPostId: true,
        contentAsset: { select: { mediaType: true } },
        insight: { select: { fetchedAt: true } },
        facebookPage: {
          select: {
            id: true,
            pageName: true,
            accessTokenEnc: true,
            connection: { select: { scopes: true, revokedAt: true } },
          },
        },
      },
    });

    const byPage = new Map<string, SyncPageTarget>();
    for (const row of rows) {
      // Hai điều kiện này SQL đã đảm bảo; kiểm lại chỉ để TypeScript thu hẹp kiểu.
      if (row.facebookPostId === null || row.publishedAt === null) continue;

      const page = row.facebookPage;
      let target = byPage.get(page.id);
      if (target === undefined) {
        target = {
          pageId: page.id,
          pageName: page.pageName,
          accessTokenEnc: page.accessTokenEnc,
          connectionScopes:
            page.connection === null || page.connection.revokedAt !== null
              ? null
              : page.connection.scopes,
          posts: [],
        };
        byPage.set(page.id, target);
      }

      target.posts.push({
        assignmentId: row.id,
        facebookPostId: row.facebookPostId,
        publishedAt: row.publishedAt,
        isVideo: row.contentAsset.mediaType === 'video',
        fetchedAt: row.insight?.fetchedAt ?? null,
      });
    }

    return [...byPage.values()];
  }

  /**
   * Ghi số liệu mới + ảnh chụp trong **một** transaction: hai bảng lệch nhau thì
   * biểu đồ xu hướng sẽ không khớp con số đang hiển thị.
   *
   * `null` = Graph không trả metric đó ⇒ **giữ nguyên giá trị cũ**, không ghi 0.
   * Bảng snapshot cũng chỉ nhận số thật, không bịa 0 cho ngày hôm đó.
   */
  async saveInsight(
    data: UpsertInsightData,
    snapshotDate: string,
  ): Promise<void> {
    // Chỉ số `null` bị BỎ HẲN khỏi payload — cả `create` lẫn `update`. Cột nào
    // chưa đo được thì để nguyên `NULL`, không bịa 0. Đây chính là chỗ từng ghi
    // `?? 0` và làm UI hiện "0 lượt xem" cho bài chưa hề lấy được số.
    const metrics = {
      ...(data.videoViews === null ? {} : { videoViews: data.videoViews }),
      ...(data.fanReach === null ? {} : { fanReach: data.fanReach }),
      ...(data.clicks === null ? {} : { clicks: data.clicks }),
    };

    await this.prisma.$transaction([
      this.prisma.postInsight.upsert({
        where: { assignmentId: data.assignmentId },
        create: {
          assignmentId: data.assignmentId,
          facebookPostId: data.facebookPostId,
          ...metrics,
          likeCount: data.likeCount,
          commentCount: data.commentCount,
          shareCount: data.shareCount,
          fetchedAt: data.fetchedAt,
        },
        update: {
          ...metrics,
          likeCount: data.likeCount,
          commentCount: data.commentCount,
          shareCount: data.shareCount,
          fetchedAt: data.fetchedAt,
          syncErrorMessage: null,
        },
      }),
      this.prisma.postInsightSnapshot.upsert({
        where: {
          assignmentId_snapshotDate: {
            assignmentId: data.assignmentId,
            snapshotDate,
          },
        },
        create: { assignmentId: data.assignmentId, snapshotDate, ...metrics },
        update: metrics,
      }),
    ]);
  }

  /**
   * Bài không còn trên Facebook. Ghi `missingOnFbAt` để lần quét sau bỏ qua —
   * đây là cái phanh duy nhất chặn việc retry vô hạn một bài đã bị xoá.
   */
  async markMissing(
    assignmentId: string,
    facebookPostId: string,
    message: string,
    at: Date,
  ): Promise<void> {
    await this.prisma.postInsight.upsert({
      where: { assignmentId },
      create: {
        assignmentId,
        facebookPostId,
        fetchedAt: at,
        missingOnFbAt: at,
        syncErrorMessage: message,
      },
      update: { missingOnFbAt: at, syncErrorMessage: message },
    });
  }

  /**
   * Lỗi tạm (rate limit, mạng, token). **Không** đụng `fetchedAt` — số cũ vẫn là
   * số hợp lệ lấy được lúc trước, ghi đè thời điểm sẽ nói dối là vừa đồng bộ xong.
   */
  async recordSyncError(
    assignmentId: string,
    facebookPostId: string,
    message: string,
    at: Date,
  ): Promise<void> {
    await this.prisma.postInsight.upsert({
      where: { assignmentId },
      create: {
        assignmentId,
        facebookPostId,
        fetchedAt: at,
        syncErrorMessage: message,
      },
      update: { syncErrorMessage: message },
    });
  }
}

function buildOrderBy(
  sortBy: InsightSortField,
  sortDir: SortDirection,
): Prisma.ContentPageAssignmentOrderByWithRelationInput {
  if (sortBy === 'publishedAt') return { publishedAt: sortDir };
  return { insight: { [sortBy]: sortDir } };
}
