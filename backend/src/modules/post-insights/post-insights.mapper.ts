import type { MediaType } from '../../../generated/prisma/client';
import type {
  PageInsightsSummary,
  PostInsightRow,
} from './post-insights.repository';

export interface PostInsightResponse {
  assignmentId: string;
  contentAssetId: string;
  facebookPostId: string;
  title: string;
  mediaType: MediaType;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  /**
   * `null` = **chưa đo được**, không phải "0". UI phải hiện `—` chứ không phải
   * `0` — nói bài không ai xem trong khi thật ra chưa đo là sai sự thật
   * (plan 25 §0.2, ràng buộc trong `erd.md` §4).
   *
   * `videoViews` chỉ có ở bài video. **Không có lượt hiển thị/tiếp cận tổng** —
   * Meta đã gỡ metric đó khỏi Graph API, xem plan 25 §8.
   */
  videoViews: number | null;
  fanReach: number | null;
  clicks: number | null;
  likeCount: number | null;
  commentCount: number | null;
  shareCount: number | null;
  fetchedAt: Date | null;
  /** true = bài đã bị xoá trên Facebook, số liệu đóng băng ở lần đo cuối. */
  missingOnFb: boolean;
  syncErrorMessage: string | null;
  /** Link tới đúng bài trên Facebook. Dựng ở backend — FE không cần biết format ID. */
  facebookPostUrl: string;
}

export interface PageInsightsSummaryResponse {
  postCount: number;
  syncedCount: number;
  totalVideoViews: number;
  totalFanReach: number;
  totalClicks: number;
  /** Trung bình lượt nhấp trên **bài đã đo** — chia cho tổng số bài sẽ pha loãng
   * bằng những bài chưa đo, ra một con số thấp giả tạo. */
  averageClicks: number;
  lastFetchedAt: Date | null;
}

/**
 * `{pageId}_{postId}` là format ID bài của Graph API. `facebook.com/{id}` nhận
 * thẳng dạng này và tự chuyển hướng tới đúng bài.
 */
export function toFacebookPostUrl(facebookPostId: string): string {
  return `https://www.facebook.com/${facebookPostId}`;
}

export function toPostInsightResponse(
  row: PostInsightRow,
): PostInsightResponse {
  // Repository đã lọc `facebookPostId: { not: null }`; fallback chỉ để thu hẹp kiểu.
  const postId = row.facebookPostId ?? '';
  const insight = row.insight;

  return {
    assignmentId: row.id,
    contentAssetId: row.contentAssetId,
    facebookPostId: postId,
    title: row.contentAsset.title,
    mediaType: row.contentAsset.mediaType,
    thumbnailUrl: row.contentAsset.thumbnailUrl,
    publishedAt: row.publishedAt,
    videoViews: insight?.videoViews ?? null,
    fanReach: insight?.fanReach ?? null,
    clicks: insight?.clicks ?? null,
    likeCount: insight?.likeCount ?? null,
    commentCount: insight?.commentCount ?? null,
    shareCount: insight?.shareCount ?? null,
    fetchedAt: insight?.fetchedAt ?? null,
    missingOnFb: insight?.missingOnFbAt != null,
    syncErrorMessage: insight?.syncErrorMessage ?? null,
    facebookPostUrl: toFacebookPostUrl(postId),
  };
}

export function toSummaryResponse(
  summary: PageInsightsSummary,
): PageInsightsSummaryResponse {
  return {
    ...summary,
    averageClicks:
      summary.syncedCount === 0
        ? 0
        : Math.round(summary.totalClicks / summary.syncedCount),
  };
}
