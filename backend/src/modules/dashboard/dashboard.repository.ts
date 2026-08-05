import { Injectable } from '@nestjs/common';
import {
  ContentStatus,
  MediaType,
  Prisma,
  PublishStatus,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import type { DashboardRange } from './dashboard-range';

/** Job đang trên đường đăng — gộp làm số "đang chạy" trên thẻ Live. */
const IN_FLIGHT_STATUSES: readonly PublishStatus[] = [
  PublishStatus.SCHEDULED,
  PublishStatus.QUEUED,
  PublishStatus.PUBLISHING,
];

export interface ContentInventoryCounts {
  pendingReview: number;
  approved: number;
  rejected: number;
  /** Đã duyệt nhưng chưa gán page nào chưa đăng ⇒ Bot không bao giờ lấy được. */
  approvedUnassigned: number;
}

export interface JobVolumeCounts {
  success: number;
  failed: number;
}

export interface DailyJobRow {
  date: string;
  success: number;
  failed: number;
}

export interface PostsByPageRow {
  pageId: string;
  pageName: string;
  imagePosts: number;
  videoPosts: number;
  failedPosts: number;
}

export interface TopCategoryRow {
  category: string;
  successPosts: number;
  pageCount: number;
}

export interface PageCounts {
  activePages: number;
  autopostEnabledPages: number;
}

export interface ExpiringTokenPage {
  id: string;
  pageName: string;
  tokenExpireAt: Date | null;
}

/**
 * Nơi duy nhất viết Prisma query cho số liệu Dashboard (rule 01).
 *
 * Hai quy ước bám theo plan 14 §3.2, không được lệch giữa các hàm:
 * - Job đếm theo `schedule_time` (job FAILED không có `published_at`, dùng lẫn
 *   hai cột thì success + failed không khớp mẫu số nào).
 * - Content đếm theo `created_at` (Bot chạm vào bài là `updated_at` nhảy sang kỳ khác).
 */
@Injectable()
export class DashboardRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Tồn kho **hiện tại**, không lọc theo khoảng ngày: "còn bao nhiêu bài chờ
   * duyệt" luôn là câu hỏi *bây giờ* (plan 14 §3.2).
   *
   * `ownerId` != null ⇒ chỉ đếm bài của chính người đó (scope role CONTENT).
   */
  async countContentInventory(
    ownerId: string | null,
  ): Promise<ContentInventoryCounts> {
    // Thẻ tồn kho chỉ đếm bài **còn dùng được** (plan 19 §2.2) — bài đã ngưng dùng
    // không phải hàng chờ Bot lấy nữa.
    const owner: Prisma.ContentAssetWhereInput =
      ownerId === null
        ? { isActive: true }
        : { isActive: true, createdById: ownerId };

    // Promise.all thay vì $transaction: gộp groupBy và count vào một mảng
    // $transaction làm Prisma suy ra kiểu `_count` thành union và mất `_all`.
    const [byStatus, approvedUnassigned] = await Promise.all([
      this.prisma.contentAsset.groupBy({
        by: ['status'],
        where: owner,
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.contentAsset.count({
        where: {
          ...owner,
          status: ContentStatus.APPROVED,
          assignments: { none: { publishedAt: null } },
        },
      }),
    ]);

    const count = (status: ContentStatus): number =>
      byStatus.find((row) => row.status === status)?._count._all ?? 0;

    return {
      pendingReview: count(ContentStatus.PENDING_REVIEW),
      approved: count(ContentStatus.APPROVED),
      rejected: count(ContentStatus.REJECTED),
      approvedUnassigned,
    };
  }

  /** Bài mới upload trong kỳ (theo `created_at`). */
  countNewContent(
    range: DashboardRange,
    ownerId: string | null,
  ): Promise<number> {
    return this.prisma.contentAsset.count({
      where: {
        ...(ownerId === null ? {} : { createdById: ownerId }),
        createdAt: { gte: range.fromUtc, lt: range.toUtc },
      },
    });
  }

  /** Video đạt ADS upload trong kỳ (FR-08.2). */
  countAdsVideos(
    range: DashboardRange,
    ownerId: string | null,
  ): Promise<number> {
    return this.prisma.contentAsset.count({
      where: {
        ...(ownerId === null ? {} : { createdById: ownerId }),
        isAds: true,
        mediaType: MediaType.video,
        createdAt: { gte: range.fromUtc, lt: range.toUtc },
      },
    });
  }

  /** Job đã đóng sổ trong kỳ, tách thành công / thất bại. */
  async countJobVolume(
    range: DashboardRange,
    ownerId: string | null,
  ): Promise<JobVolumeCounts> {
    const rows = await this.prisma.publishJob.groupBy({
      by: ['status'],
      where: {
        scheduleTime: { gte: range.fromUtc, lt: range.toUtc },
        status: { in: [PublishStatus.SUCCESS, PublishStatus.FAILED] },
        ...ownerScope(ownerId),
      },
      orderBy: { status: 'asc' },
      _count: { _all: true },
    });

    const count = (status: PublishStatus): number =>
      rows.find((row) => row.status === status)?._count._all ?? 0;

    return {
      success: count(PublishStatus.SUCCESS),
      failed: count(PublishStatus.FAILED),
    };
  }

  /** Job đang trên đường đăng **ngay lúc này** — không liên quan khoảng ngày. */
  countInFlightJobs(ownerId: string | null): Promise<number> {
    return this.prisma.publishJob.count({
      where: {
        status: { in: [...IN_FLIGHT_STATUSES] },
        ...ownerScope(ownerId),
      },
    });
  }

  async countPages(): Promise<PageCounts> {
    const [activePages, autopostEnabledPages] = await this.prisma.$transaction([
      this.prisma.facebookPage.count({
        where: { deletedAt: null, isActive: true },
      }),
      this.prisma.facebookPage.count({
        where: { deletedAt: null, isActive: true, autopostEnabled: true },
      }),
    ]);
    return { activePages, autopostEnabledPages };
  }

  countActiveUsers(): Promise<number> {
    return this.prisma.user.count({ where: { isActive: true } });
  }

  /**
   * Job theo **ngày giờ Việt Nam**. Phải gom trong SQL chứ không gom ở JS: bài
   * đăng 23:30 giờ VN có `schedule_time` UTC là 16:30 cùng ngày, nhưng bài 00:30
   * giờ VN lại là 17:30 **hôm trước** — gom theo UTC là đẩy nhầm sang cột khác
   * trong chart mà nhìn vẫn "hợp lý".
   *
   * **Phải `AT TIME ZONE 'UTC'` trước rồi mới `AT TIME ZONE <tz>`.** Prisma map
   * `DateTime` sang `timestamp` *without* time zone, nên một lần `AT TIME ZONE`
   * duy nhất sẽ hiểu giá trị đang lưu là giờ VN và cộng nhầm chiều — đã tái hiện
   * đúng lỗi này khi smoke test, cả hai bài 23:30 và 00:30 dồn vào một ngày.
   */
  dailyJobStats(
    range: DashboardRange,
    timezone: string,
    ownerId: string | null,
  ): Promise<DailyJobRow[]> {
    const ownerFilter =
      ownerId === null
        ? Prisma.empty
        : Prisma.sql`AND c.created_by = ${ownerId}::uuid`;

    return this.prisma.$queryRaw<DailyJobRow[]>`
      SELECT to_char(
               (j.schedule_time AT TIME ZONE 'UTC' AT TIME ZONE ${timezone})::date,
               'YYYY-MM-DD'
             ) AS "date",
             COUNT(*) FILTER (WHERE j.status = 'SUCCESS')::int AS "success",
             COUNT(*) FILTER (WHERE j.status = 'FAILED')::int  AS "failed"
        FROM publish_jobs j
        JOIN content_assets c ON c.id = j.content_asset_id
       WHERE j.schedule_time >= ${range.fromUtc}
         AND j.schedule_time <  ${range.toUtc}
         AND j.status IN ('SUCCESS', 'FAILED')
         ${ownerFilter}
       GROUP BY 1
       ORDER BY 1
    `;
  }

  /**
   * Bài đăng thành công theo từng page, tách ảnh / video (FR-08.3).
   *
   * Page đã xoá mềm thì bỏ; page **tạm dừng** vẫn hiện nếu có job trong kỳ —
   * che đi là mất số liệu lịch sử của page đó.
   */
  postsByPage(
    range: DashboardRange,
    mediaType: 'image' | 'video' | 'all',
    ownerId: string | null,
  ): Promise<PostsByPageRow[]> {
    const mediaFilter =
      mediaType === 'all'
        ? Prisma.empty
        : Prisma.sql`AND c.media_type = ${mediaType}::"MediaType"`;
    const ownerFilter =
      ownerId === null
        ? Prisma.empty
        : Prisma.sql`AND c.created_by = ${ownerId}::uuid`;

    return this.prisma.$queryRaw<PostsByPageRow[]>`
      SELECT p.id        AS "pageId",
             p.page_name AS "pageName",
             COUNT(*) FILTER (
               WHERE j.status = 'SUCCESS' AND c.media_type = 'image'
             )::int AS "imagePosts",
             COUNT(*) FILTER (
               WHERE j.status = 'SUCCESS' AND c.media_type = 'video'
             )::int AS "videoPosts",
             COUNT(*) FILTER (WHERE j.status = 'FAILED')::int AS "failedPosts"
        FROM publish_jobs j
        JOIN content_assets c ON c.id = j.content_asset_id
        JOIN facebook_pages p ON p.id = j.facebook_page_id
       WHERE j.schedule_time >= ${range.fromUtc}
         AND j.schedule_time <  ${range.toUtc}
         AND j.status IN ('SUCCESS', 'FAILED')
         AND p.deleted_at IS NULL
         ${mediaFilter}
         ${ownerFilter}
       GROUP BY p.id, p.page_name
       -- Postgres không cho dùng alias trong biểu thức ORDER BY ⇒ lặp lại
       -- nguyên hàm đếm thay vì viết "imagePosts" + "videoPosts".
       ORDER BY COUNT(*) FILTER (WHERE j.status = 'SUCCESS') DESC,
                p.page_name ASC
    `;
  }

  /**
   * Top danh mục ("dạng" bài) được đăng **thành công** nhiều nhất, gộp trên
   * nhiều page (bổ sung 2026-08-05, ngoài `docs/04` §8 — theo yêu cầu user).
   *
   * `category` là text tự do, không có bảng riêng (giống hashtag) ⇒ group
   * thẳng theo giá trị chuỗi, không qua bảng lookup nào.
   */
  topCategoriesBySuccess(
    range: DashboardRange,
    limit: number,
    ownerId: string | null,
  ): Promise<TopCategoryRow[]> {
    const ownerFilter =
      ownerId === null
        ? Prisma.empty
        : Prisma.sql`AND c.created_by = ${ownerId}::uuid`;

    return this.prisma.$queryRaw<TopCategoryRow[]>`
      SELECT c.category AS "category",
             COUNT(*)::int AS "successPosts",
             COUNT(DISTINCT j.facebook_page_id)::int AS "pageCount"
        FROM publish_jobs j
        JOIN content_assets c ON c.id = j.content_asset_id
        JOIN facebook_pages p ON p.id = j.facebook_page_id
       WHERE j.schedule_time >= ${range.fromUtc}
         AND j.schedule_time <  ${range.toUtc}
         AND j.status = 'SUCCESS'
         AND p.deleted_at IS NULL
         ${ownerFilter}
       GROUP BY c.category
       ORDER BY COUNT(*) DESC, c.category ASC
       LIMIT ${limit}
    `;
  }

  /** Page có token sắp hết hạn ⇒ Bot sẽ đăng hỏng mà không ai biết trước. */
  findPagesWithExpiringToken(before: Date): Promise<ExpiringTokenPage[]> {
    return this.prisma.facebookPage.findMany({
      where: {
        deletedAt: null,
        tokenExpireAt: { not: null, lt: before },
      },
      select: { id: true, pageName: true, tokenExpireAt: true },
      orderBy: { tokenExpireAt: 'asc' },
    });
  }
}

/** Scope role CONTENT: chỉ job của bài do chính người đó tạo (plan 14 §3.4). */
function ownerScope(ownerId: string | null): Prisma.PublishJobWhereInput {
  return ownerId === null ? {} : { contentAsset: { createdById: ownerId } };
}
