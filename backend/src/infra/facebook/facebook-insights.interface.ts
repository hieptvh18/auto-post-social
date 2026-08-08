/**
 * Cổng ra Meta Graph Insights (plan 25). Tách khỏi `FacebookGraph` vì đây là mối
 * quan tâm khác hẳn: OAuth/kết nối page là luồng người dùng bấm nút, còn insights
 * là job nền chạy định kỳ và phải chịu được lỗi từng phần.
 *
 * **Chỉ đọc.** Không có method nào ở đây được phép đổi state trên Facebook.
 */

/** Một bài cần lấy số liệu. `isVideo` quyết định có hỏi metric video hay không. */
export interface FacebookInsightTarget {
  /** Dạng `{pageId}_{postId}` — đúng thứ đã lưu ở `content_page_assignments`. */
  postId: string;
  isVideo: boolean;
}

/**
 * Số liệu của một bài.
 *
 * **`null` KHÁC `0`.** `null` = Graph không trả chỉ số đó (không áp dụng cho loại
 * bài này, hoặc Meta đã gỡ metric). `0` = Graph trả về đúng số không. Service
 * phải giữ nguyên số cũ khi gặp `null` — ghi đè thành 0 là biến "chưa đo được"
 * thành "không ai xem", đúng thứ đã làm hỏng dữ liệu lần đầu chạy thật.
 *
 * **Không có `impressions`/`reach` tổng:** Meta đã gỡ hẳn `post_impressions*`,
 * `post_reach`, `page_impressions*` khỏi Graph API (đo thật 2026-08-08 trên
 * v19→v23, tất cả trả `(#100) The value must be a valid insights metric` với
 * token PAGE có đủ `read_insights`). Đừng thêm lại mà không đo lại trước.
 */
export interface FacebookPostInsight {
  postId: string;
  /** `post_video_views` — chỉ bài video mới có. */
  videoViews: number | null;
  /** `post_fan_reach` — người **theo dõi page** đã thấy bài. Không phải reach tổng. */
  fanReach: number | null;
  /** `post_clicks` — lượt nhấp vào bài. */
  clicks: number | null;
  /** Engagement đọc từ field thường (không cần `read_insights`) nên luôn có số. */
  likeCount: number;
  commentCount: number;
  shareCount: number;
}

export interface FacebookPostInsightError {
  postId: string;
  /**
   * true = Graph **khẳng định** bài không còn tồn tại (`error_subcode = 33`).
   * Caller đánh dấu `missing_on_fb_at` và **ngừng** đồng bộ bài này.
   *
   * Cố tình **không** suy ra từ `code = 100` trần: Graph dùng đúng code đó cho cả
   * "tên metric không hợp lệ". Suy sai một lần là ba bài đang sống bị đóng dấu
   * "đã xoá" vĩnh viễn mà không ai biết — đã xảy ra thật ngày 2026-08-08.
   */
  isMissing: boolean;
  /**
   * true = Graph từ chối vì **tên metric sai**, không phải lỗi của bài. Caller
   * phải dừng cả page và báo động, vì mọi bài sẽ hỏng y hệt.
   */
  isInvalidMetric: boolean;
  message: string;
}

export interface FacebookInsightsResult {
  ok: FacebookPostInsight[];
  failed: FacebookPostInsightError[];
}

export interface FacebookInsights {
  /**
   * Lấy số liệu nhiều bài bằng Graph Batch API.
   *
   * **Không bao giờ throw vì một bài hỏng.** Batch trả về mảng, mỗi phần tử có
   * `code` riêng — một bài bị xoá trả 400 trong khi 49 bài còn lại trả 200. Gộp
   * cả lô thành lỗi là mất sạch dữ liệu vì đúng một bài. Chỉ throw khi cả request
   * không đi được (mạng/token hỏng).
   *
   * Vượt {@link INSIGHTS_BATCH_SIZE} bài thì tự chia lô.
   */
  getPostInsights(
    targets: FacebookInsightTarget[],
    pageAccessToken: string,
  ): Promise<FacebookInsightsResult>;
}

/** Trần cứng của Graph Batch API. Không phải con số tự chọn. */
export const INSIGHTS_BATCH_SIZE = 50;
