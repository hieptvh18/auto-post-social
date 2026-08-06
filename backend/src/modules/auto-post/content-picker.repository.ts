import { Injectable } from '@nestjs/common';
import {
  ContentStatus,
  Prisma,
  type MediaType,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Bài được picker chọn — chỉ những cột engine thực sự cần để tạo job và đăng. */
export interface PickedContent {
  id: string;
  title: string;
  caption: string;
  hashtags: string | null;
  mediaType: MediaType;
  driveFileId: string;
  mimeType: string | null;
  updatedAt: Date;
}

/**
 * Trần khi *đếm* bài sẵn sàng. Đếm bằng cách chạy lại đúng câu pick (bỏ LIMIT thật)
 * để con số trên UI không bao giờ lệch với cái Bot chọn; ở quy mô MVP (vài trăm bài)
 * chi phí không đáng kể, quá trần thì hiển thị "500+" là đủ nghĩa.
 */
const MAX_COUNT = 500;

/** Một dòng kho bài của page, gom theo danh mục. */
export interface CategoryAvailabilityRow {
  category: string;
  imageCount: number;
  videoCount: number;
}

export interface PickForSlotParams {
  facebookPageId: string;
  categories: string[];
  /** `'all'` nghĩa là không lọc theo loại media. */
  mediaType: 'image' | 'video' | 'all';
  limit: number;
}

/**
 * Mọi câu ở đây đều phải có `is_active = TRUE` (plan 19 §2.2): bài đã "ngưng dùng"
 * mà lọt vào picker là Bot đăng thật lên page.
 *
 * Bài nhiều ảnh (plan 22) **không** cần điều kiện riêng ở đây: mọi ảnh của nó nằm
 * trong đúng một dòng `content_assets`, ghép lại lúc đăng — picker vẫn chỉ chọn
 * theo content như bài 1 ảnh.
 *
 * Query chọn bài cho Bot — **hàm dễ sai nhất hệ thống** (picker sai ⇒ đăng lặp
 * hoặc bỏ sót). Viết raw vì Prisma không diễn tả gọn `NOT EXISTS` + `= ANY`.
 * Bám đúng `docs/03-database-design.md` §7.
 *
 * `publish_jobs.status IN ('QUEUED','PUBLISHING','FAILED')` bị loại khỏi diện
 * pick — **FAILED cũng phải loại** (plan 20, phát hiện 2026-08-05): nếu không,
 * tick cron sau sẽ tự re-pick nội dung vừa đăng lỗi và tạo job trùng một cách
 * âm thầm. Muốn đăng lại nội dung lỗi thì dùng nút "Đăng lại"/"Chạy lại mốc này"
 * (tự re-dùng job cũ), không phải để Bot tự chọn lại.
 */
@Injectable()
export class ContentPickerRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Đếm bài **thực sự** đăng được cho mốc giờ này — cùng điều kiện với
   * `pickForSlot`, chỉ bỏ `LIMIT`. Dùng cho cảnh báo "hết bài" trên UI: con số
   * phải khớp tuyệt đối với cái Bot sẽ chọn, nếu không UI nói một đằng Bot làm
   * một nẻo.
   */
  async countForSlot(
    params: Omit<PickForSlotParams, 'limit'>,
  ): Promise<number> {
    const rows = await this.pickForSlot({ ...params, limit: MAX_COUNT });
    return rows.length;
  }

  /**
   * Bài đã phân bổ vào page và chưa đăng — **không** lọc theo danh mục/loại media.
   * Dùng để nói đúng lý do khi hết bài: chưa phân bổ bài nào cho page, hay có
   * phân bổ nhưng không khớp cấu hình của mốc giờ.
   */
  countAssignedPending(facebookPageId: string): Promise<number> {
    return this.prisma.contentPageAssignment.count({
      where: {
        facebookPageId,
        publishedAt: null,
        contentAsset: {
          isActive: true,
          status: {
            in: [
              ContentStatus.APPROVED,
              ContentStatus.PUBLISHING,
              ContentStatus.PUBLISHED,
            ],
          },
        },
      },
    });
  }

  /**
   * Kho bài sẵn sàng của **một page**, tách theo danh mục và loại media. Dùng cho
   * form "Thêm mốc giờ đăng": chọn danh mục nào thì biết ngay page này còn bao
   * nhiêu ảnh/video để Bot đăng.
   *
   * Điều kiện **giống hệt** `pickForSlot` (bỏ lọc danh mục/media vì đang gom
   * nhóm theo chính hai chiều đó) — nếu lệch thì form hứa một đằng Bot làm một nẻo.
   */
  countByCategoryForPage(
    facebookPageId: string,
  ): Promise<CategoryAvailabilityRow[]> {
    return this.prisma.$queryRaw<CategoryAvailabilityRow[]>`
      SELECT c.category,
             COUNT(*) FILTER (WHERE c.media_type = 'image')::int AS "imageCount",
             COUNT(*) FILTER (WHERE c.media_type = 'video')::int AS "videoCount"
        FROM content_assets c
        JOIN content_page_assignments a
          ON a.content_asset_id = c.id
         AND a.facebook_page_id = ${facebookPageId}::uuid
         AND a.published_at IS NULL
       WHERE c.status IN ('APPROVED', 'PUBLISHING', 'PUBLISHED')
         AND c.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM publish_jobs j
            WHERE j.content_asset_id = c.id
              AND j.facebook_page_id = ${facebookPageId}::uuid
              AND j.status IN ('QUEUED', 'PUBLISHING', 'FAILED')
         )
       GROUP BY c.category
    `;
  }

  pickForSlot(params: PickForSlotParams): Promise<PickedContent[]> {
    // Điều kiện media: 'all' ⇒ không lọc. Ghép bằng Prisma.sql để giữ tham số hoá.
    const mediaFilter =
      params.mediaType === 'all'
        ? Prisma.empty
        : Prisma.sql`AND c.media_type = ${params.mediaType}::"MediaType"`;

    return this.prisma.$queryRaw<PickedContent[]>`
      SELECT c.id,
             c.title,
             c.caption,
             c.hashtags,
             c.media_type   AS "mediaType",
             c.drive_file_id AS "driveFileId",
             c.mime_type    AS "mimeType",
             c.updated_at   AS "updatedAt"
        FROM content_assets c
        JOIN content_page_assignments a
          ON a.content_asset_id = c.id
         AND a.facebook_page_id = ${params.facebookPageId}::uuid
         AND a.published_at IS NULL
       WHERE c.status IN ('APPROVED', 'PUBLISHING', 'PUBLISHED')
         AND c.is_active = TRUE
         AND c.category = ANY(${params.categories}::text[])
         ${mediaFilter}
         AND NOT EXISTS (
           SELECT 1 FROM publish_jobs j
            WHERE j.content_asset_id = c.id
              AND j.facebook_page_id = ${params.facebookPageId}::uuid
              AND j.status IN ('QUEUED', 'PUBLISHING', 'FAILED')
         )
       ORDER BY c.updated_at ASC
       LIMIT ${params.limit}
    `;
  }
}
