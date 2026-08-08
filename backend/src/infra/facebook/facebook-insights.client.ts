import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';
import {
  INSIGHTS_BATCH_SIZE,
  type FacebookInsightTarget,
  type FacebookInsights,
  type FacebookInsightsResult,
  type FacebookPostInsight,
  type FacebookPostInsightError,
} from './facebook-insights.interface';
import { FacebookGraphError, readGraphError } from './facebook.errors';

const GRAPH_BASE_URL = 'https://graph.facebook.com';
/** Job nền, không ai ngồi chờ — nhưng cũng không để treo vô hạn giữ connection. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Ba chỉ số **đã đo thật** là còn sống trên Graph v21.0 (2026-08-08).
 *
 * Đừng thêm `post_impressions`, `post_impressions_unique`, `post_reach`,
 * `post_views` hay `post_engaged_users` vào đây: Meta đã gỡ hẳn, mọi version
 * v19→v23 đều trả `(#100) The value must be a valid insights metric`. Muốn thêm
 * metric mới thì **đo trước bằng Graph API Explorer**, đừng đoán theo tài liệu cũ.
 */
const METRIC_VIDEO_VIEWS = 'post_video_views';
const METRIC_FAN_REACH = 'post_fan_reach';
const METRIC_CLICKS = 'post_clicks';

/** Dùng khi dò xem page hỗ trợ metric nào (xem `learnUnsupportedMetrics`). */
const ALL_METRICS = [METRIC_FAN_REACH, METRIC_CLICKS, METRIC_VIDEO_VIEWS];

/**
 * `error_subcode = 33` là tín hiệu **duy nhất** đủ chắc để kết luận bài không còn
 * tồn tại. Cấm dùng `code = 100` trần: Graph trả đúng code đó cho cả "tên metric
 * sai", và đánh dấu nhầm sẽ **ngừng vĩnh viễn** việc theo dõi một bài đang sống.
 */
const MISSING_OBJECT_SUBCODE = 33;

/** Dấu hiệu Graph chê tên metric chứ không phải chê bài. */
const INVALID_METRIC_HINT = 'valid insights metric';

/** Một phần tử trong mảng response của Batch API. */
interface BatchEntry {
  code: number;
  body: unknown;
}

@Injectable()
export class FacebookInsightsClient implements FacebookInsights {
  private readonly logger = new Logger(FacebookInsightsClient.name);

  constructor(private readonly config: AppConfigService) {}

  /**
   * Metric mà Graph đã từ chối — học được lúc chạy, không hard-code.
   *
   * Meta cấp metric **khác nhau tuỳ page** (page "New Page Experience" khác page
   * cũ) nên cùng một danh sách hằng có thể chạy ở page này và vỡ ở page kia. Danh
   * sách cứng là thứ đã làm prod hỏng ngày 2026-08-08 trong khi máy dev vẫn xanh.
   *
   * Khoá là `pageId` lấy từ tiền tố của `{pageId}_{postId}` — không dùng chung một
   * Set toàn cục, vì metric hỏng ở page A không có nghĩa là hỏng ở page B.
   */
  private readonly unsupportedByPage = new Map<string, Set<string>>();

  async getPostInsights(
    targets: FacebookInsightTarget[],
    pageAccessToken: string,
  ): Promise<FacebookInsightsResult> {
    const result = await this.fetchAll(targets, pageAccessToken);

    const rejected = result.failed.filter((f) => f.isInvalidMetric);
    if (rejected.length === 0) return result;

    // Graph chỉ nói "metric không hợp lệ", KHÔNG nói metric nào. Dò từng cái để
    // biết, loại ra, rồi thử lại — thay vì bỏ cả page và trả về màn hình rỗng.
    const rejectedIds = new Set(rejected.map((f) => f.postId));
    const retryTargets = targets.filter((t) => rejectedIds.has(t.postId));
    const learned = await this.learnUnsupportedMetrics(
      retryTargets,
      pageAccessToken,
    );
    if (!learned) return result;

    const retried = await this.fetchAll(retryTargets, pageAccessToken);
    return {
      ok: [...result.ok, ...retried.ok],
      failed: [
        ...result.failed.filter((f) => !rejectedIds.has(f.postId)),
        ...retried.failed,
      ],
    };
  }

  private async fetchAll(
    targets: FacebookInsightTarget[],
    pageAccessToken: string,
  ): Promise<FacebookInsightsResult> {
    const result: FacebookInsightsResult = { ok: [], failed: [] };

    for (let i = 0; i < targets.length; i += INSIGHTS_BATCH_SIZE) {
      const chunk = targets.slice(i, i + INSIGHTS_BATCH_SIZE);
      const entries = await this.sendBatch(chunk, pageAccessToken);

      chunk.forEach((target, index) => {
        const entry = entries[index];
        if (entry === undefined) {
          // Graph phải trả đúng số phần tử đã gửi. Thiếu phần tử là bất thường —
          // ghi nhận thành lỗi của riêng bài đó, không kéo cả lô xuống.
          result.failed.push({
            postId: target.postId,
            isMissing: false,
            isInvalidMetric: false,
            message: 'Facebook không trả kết quả cho bài này trong lô batch.',
          });
          return;
        }

        const parsed = this.parseEntry(target, entry);
        if ('message' in parsed) result.failed.push(parsed);
        else result.ok.push(parsed);
      });
    }

    return result;
  }

  /**
   * Hỏi Graph **từng metric một** trên đúng 1 bài để biết metric nào bị từ chối.
   * Tốn 1 request cho cả page và chỉ chạy khi đã có lỗi — rẻ hơn nhiều so với
   * việc màn thống kê trống trơn cho tới khi có người sửa code.
   *
   * Trả `false` khi không học thêm được gì (tránh vòng lặp thử lại vô ích).
   */
  private async learnUnsupportedMetrics(
    targets: FacebookInsightTarget[],
    accessToken: string,
  ): Promise<boolean> {
    const sample = targets[0];
    if (sample === undefined) return false;

    const pageId = pageIdOf(sample.postId);
    const known = this.unsupportedFor(pageId);
    const candidates = ALL_METRICS.filter((m) => !known.has(m));
    if (candidates.length === 0) return false;

    const { graphVersion } = this.config.facebook;
    const batch = candidates.map((metric) => ({
      method: 'GET',
      relative_url: `${encodeURIComponent(sample.postId)}/insights?metric=${metric}`,
    }));

    let entries: BatchEntry[];
    try {
      entries = await this.postBatch(batch, accessToken, graphVersion);
    } catch {
      // Dò thất bại thì thôi, giữ nguyên kết quả lỗi ban đầu.
      return false;
    }

    let learnedAny = false;
    candidates.forEach((metric, index) => {
      const entry = entries[index];
      if (entry === undefined) return;
      if (entry.code >= 200 && entry.code < 300) return;

      known.add(metric);
      learnedAny = true;
    });

    if (learnedAny) {
      this.logger.warn(
        `Page ${pageId}: Facebook không hỗ trợ metric [${[...known].join(', ')}] — ` +
          'đã tự loại và sẽ không hỏi lại. Các chỉ số còn lại vẫn được lấy bình thường.',
      );
    }
    return learnedAny;
  }

  private unsupportedFor(pageId: string): Set<string> {
    const existing = this.unsupportedByPage.get(pageId);
    if (existing !== undefined) return existing;

    const created = new Set<string>();
    this.unsupportedByPage.set(pageId, created);
    return created;
  }

  /**
   * Một request batch. Ném lỗi **chỉ** khi cả request không đi được — lỗi của
   * từng bài nằm trong `code` của từng phần tử, không phải ở tầng này.
   */
  private async sendBatch(
    targets: FacebookInsightTarget[],
    accessToken: string,
  ): Promise<BatchEntry[]> {
    const { graphVersion } = this.config.facebook;
    const batch = targets.map((target) => ({
      method: 'GET',
      relative_url: this.buildRelativeUrl(target),
    }));

    return this.postBatch(batch, accessToken, graphVersion);
  }

  private async postBatch(
    batch: { method: string; relative_url: string }[],
    accessToken: string,
    graphVersion: string,
  ): Promise<BatchEntry[]> {
    // access_token đi trong body form, không trên query string — tránh lọt vào
    // access log của proxy. `include_headers=false` cắt ~2/3 kích thước response.
    const form = new URLSearchParams({
      access_token: accessToken,
      include_headers: 'false',
      batch: JSON.stringify(batch),
    });

    let response: Response;
    try {
      response = await fetch(`${GRAPH_BASE_URL}/${graphVersion}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      this.logger.error(
        `Không gọi được Meta Graph batch insights: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new FacebookGraphError(
        'Không kết nối được tới Facebook khi lấy số liệu bài đăng.',
      );
    }

    const body: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const { message, code } = readGraphError(body);
      this.logger.error(
        `Meta Graph từ chối cả lô batch insights: http=${response.status} code=${String(code)} message=${String(message)}`,
      );
      throw new FacebookGraphError(
        `Facebook từ chối yêu cầu lấy số liệu: ${String(message ?? 'không rõ nguyên nhân')}`,
        code,
      );
    }

    if (!Array.isArray(body)) {
      throw new FacebookGraphError(
        'Facebook trả về dữ liệu batch không đọc được khi lấy số liệu bài đăng.',
      );
    }

    return body.map((item): BatchEntry => this.toBatchEntry(item));
  }

  private buildRelativeUrl(target: FacebookInsightTarget): string {
    const unsupported = this.unsupportedFor(pageIdOf(target.postId));
    const metrics = [METRIC_FAN_REACH, METRIC_CLICKS]
      // Chỉ hỏi metric video cho bài video: hỏi thừa trên bài ảnh làm Graph trả
      // metric rỗng, lẫn với ca "metric không tồn tại" mà ta cần phân biệt.
      .concat(target.isVideo ? [METRIC_VIDEO_VIEWS] : [])
      .filter((metric) => !unsupported.has(metric));

    // Page không hỗ trợ metric nào ⇒ BỎ HẲN khối `insights` thay vì gửi
    // `insights.metric()` rỗng (Graph coi là cú pháp sai và trượt cả bài). Vẫn
    // lấy like/comment/share — chúng không cần `read_insights`.
    const fields = [
      ...(metrics.length === 0
        ? []
        : [`insights.metric(${metrics.join(',')})`]),
      'likes.summary(true)',
      'comments.summary(true)',
      'shares',
    ].join(',');

    return `${encodeURIComponent(target.postId)}?fields=${encodeURIComponent(fields)}`;
  }

  /** Body của mỗi phần tử batch là **chuỗi JSON**, không phải object. */
  private toBatchEntry(item: unknown): BatchEntry {
    if (item === null || typeof item !== 'object') {
      return { code: 0, body: null };
    }
    const raw = item as { code?: unknown; body?: unknown };
    const code = typeof raw.code === 'number' ? raw.code : 0;

    if (typeof raw.body !== 'string') return { code, body: null };
    try {
      return { code, body: JSON.parse(raw.body) as unknown };
    } catch {
      return { code, body: null };
    }
  }

  private parseEntry(
    target: FacebookInsightTarget,
    entry: BatchEntry,
  ): FacebookPostInsight | FacebookPostInsightError {
    if (entry.code < 200 || entry.code >= 300) {
      const {
        message,
        code,
        error_subcode: subcode,
      } = readGraphError(entry.body);
      const text = String(message ?? '');
      const isInvalidMetric = text.includes(INVALID_METRIC_HINT);
      const isMissing = subcode === MISSING_OBJECT_SUBCODE;

      if (isInvalidMetric) {
        // Không nói là lỗi ở đây: caller sẽ dò xem metric nào bị chê rồi thử lại.
        this.logger.warn(
          `Page ${pageIdOf(target.postId)} từ chối một metric ("${text}") — đang dò để loại metric đó ra.`,
        );
      } else {
        this.logger.warn(
          `Không lấy được số liệu bài ${target.postId}: code=${String(code)} subcode=${String(subcode)} message=${text}`,
        );
      }

      return {
        postId: target.postId,
        isMissing,
        isInvalidMetric,
        message: isMissing
          ? 'Bài này không còn tồn tại trên Facebook (đã bị xoá hoặc bị gỡ).'
          : `Facebook trả lỗi khi lấy số liệu: ${text || 'không rõ nguyên nhân'}`,
      };
    }

    const body =
      entry.body !== null && typeof entry.body === 'object'
        ? (entry.body as Record<string, unknown>)
        : {};

    // Không cảnh báo "thiếu khối insights" khi chính ta đã cố ý không hỏi metric
    // nào (page không hỗ trợ cái nào) — đó là trạng thái đã biết, không phải sự cố.
    const askedForMetrics =
      this.unsupportedFor(pageIdOf(target.postId)).size < ALL_METRICS.length;
    const metrics = this.readMetrics(
      body.insights,
      target.postId,
      askedForMetrics,
    );

    return {
      postId: target.postId,
      fanReach: metrics.get(METRIC_FAN_REACH) ?? null,
      clicks: metrics.get(METRIC_CLICKS) ?? null,
      videoViews: target.isVideo
        ? (metrics.get(METRIC_VIDEO_VIEWS) ?? null)
        : null,
      likeCount: readSummaryCount(body.likes),
      commentCount: readSummaryCount(body.comments),
      shareCount: readShareCount(body.shares),
    };
  }

  /**
   * `insights` có dạng `{ data: [{ name, values: [{ value }] }] }`.
   *
   * Metric đã bị Meta deprecate **không báo lỗi** mà đơn giản là biến mất khỏi
   * `data` — nếu coi đó là 0 thì một hôm đẹp trời toàn bộ số liệu về 0 mà không
   * ai biết vì sao. Vắng mặt ⇒ không có key trong Map ⇒ caller nhận `null`.
   */
  private readMetrics(
    insights: unknown,
    postId: string,
    askedForMetrics: boolean,
  ): Map<string, number | null> {
    const result = new Map<string, number | null>();
    if (!askedForMetrics) return result;

    const data =
      insights !== null && typeof insights === 'object'
        ? (insights as { data?: unknown }).data
        : null;

    if (!Array.isArray(data)) {
      this.logger.warn(
        `Bài ${postId} không có khối insights nào trong response — kiểm tra lại tên metric với Graph version đang dùng.`,
      );
      return result;
    }

    for (const item of data) {
      if (item === null || typeof item !== 'object') continue;
      const { name, values } = item as { name?: unknown; values?: unknown };
      if (typeof name !== 'string' || !Array.isArray(values)) continue;

      // `Array.isArray` chỉ thu hẹp về `any[]` — chú thích lại thành `unknown[]`
      // để phần tử không lọt ra ngoài dưới dạng `any`.
      const first: unknown = (values as unknown[])[0];
      const value =
        first !== null && typeof first === 'object'
          ? (first as { value?: unknown }).value
          : undefined;

      result.set(name, typeof value === 'number' ? value : null);
    }

    return result;
  }
}

/**
 * ID bài của Graph có dạng `{pageId}_{postId}`. Tách phần page ra để nhớ "page
 * này không hỗ trợ metric nào" — metric hỏng ở page A không suy ra hỏng ở page B.
 * Không đúng format thì trả nguyên chuỗi: sai cách nhóm còn hơn ném lỗi.
 */
function pageIdOf(facebookPostId: string): string {
  const separator = facebookPostId.indexOf('_');
  return separator === -1 ? facebookPostId : facebookPostId.slice(0, separator);
}

/** `likes`/`comments` với `summary(true)` trả `{ summary: { total_count } }`. */
function readSummaryCount(field: unknown): number {
  if (field === null || typeof field !== 'object') return 0;
  const { summary } = field as { summary?: unknown };
  if (summary === null || typeof summary !== 'object') return 0;
  const { total_count: total } = summary as { total_count?: unknown };
  return typeof total === 'number' ? total : 0;
}

/** `shares` là `{ count }` và **vắng mặt hoàn toàn** khi bài chưa có lượt share. */
function readShareCount(field: unknown): number {
  if (field === null || typeof field !== 'object') return 0;
  const { count } = field as { count?: unknown };
  return typeof count === 'number' ? count : 0;
}
