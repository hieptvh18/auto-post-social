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
 * Hai chỉ số **đã đo thật** là còn sống trên Graph v21.0 (2026-08-08) ở edge
 * `/{postId}/insights`.
 *
 * Đừng thêm `post_impressions`, `post_impressions_unique`, `post_reach`,
 * `post_views` hay `post_engaged_users` vào đây: Meta đã gỡ hẳn, mọi version
 * v19→v23 đều trả `(#100) The value must be a valid insights metric`. Muốn thêm
 * metric mới thì **đo trước bằng Graph API Explorer**, đừng đoán theo tài liệu cũ.
 */
const METRIC_FAN_REACH = 'post_fan_reach';
const METRIC_CLICKS = 'post_clicks';

/** Dùng khi dò xem page hỗ trợ metric nào (xem `learnUnsupportedMetrics`). */
const ALL_METRICS = [METRIC_FAN_REACH, METRIC_CLICKS];

/**
 * Lượt xem video **không** nằm ở edge `/{postId}/insights` như các metric trên.
 *
 * `postId` mà tool lưu cho bài video là **video_id** thô (xem
 * `FacebookPublisherClient.publishVideo`), không phải `{pageId}_{postId}` như
 * ảnh — video_id vẫn mở đúng permalink `facebook.com/{id}` nên không ai để ý,
 * nhưng nó không phải "post" theo nghĩa Graph insights hiểu. Số xem thật nằm ở
 * edge riêng của video object: `/{video_id}/video_insights?metric=total_video_views`.
 * Nhét `post_video_views` vào `insights.metric()` chung với fan_reach/clicks
 * (cách cũ) không lỗi, chỉ **im lặng trả rỗng** — bug phát hiện 2026-08-13, user
 * báo "không fetch được lượt view video".
 */
const METRIC_TOTAL_VIDEO_VIEWS = 'total_video_views';
const VIDEO_INSIGHTS_PERIOD = 'lifetime';

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
    const merged = await (async (): Promise<FacebookInsightsResult> => {
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
    })();

    // Lượt xem video đi qua edge riêng `/{video_id}/video_insights` — không phải
    // metric trong `insights.metric()` ở trên. Chỉ hỏi cho bài video đã lấy được
    // fields thành công (bài lỗi/đã xoá thì hỏi thêm cũng vô ích).
    const okIds = new Set(merged.ok.map((post) => post.postId));
    const videoTargets = targets.filter(
      (target) => target.isVideo && okIds.has(target.postId),
    );
    if (videoTargets.length === 0) return merged;

    const videoViews = await this.fetchVideoViews(
      videoTargets,
      pageAccessToken,
    );
    return {
      ...merged,
      ok: merged.ok.map((post) =>
        videoViews.has(post.postId)
          ? { ...post, videoViews: videoViews.get(post.postId) ?? null }
          : post,
      ),
    };
  }

  /**
   * Hỏi `total_video_views` cho từng video qua edge `/{video_id}/video_insights`,
   * tách riêng khỏi batch fields vì đây là edge khác hẳn (không phải
   * `insights.metric()` trên post). Lỗi ở đây chỉ làm `videoViews` giữ `null` cho
   * đúng bài đó — không kéo cả kết quả `getPostInsights` xuống, vì fan_reach/
   * clicks/like/comment/share đã lấy xong ở bước trước.
   */
  private async fetchVideoViews(
    targets: FacebookInsightTarget[],
    pageAccessToken: string,
  ): Promise<Map<string, number | null>> {
    const result = new Map<string, number | null>();
    const { graphVersion } = this.config.facebook;

    for (let i = 0; i < targets.length; i += INSIGHTS_BATCH_SIZE) {
      const chunk = targets.slice(i, i + INSIGHTS_BATCH_SIZE);
      const batch = chunk.map((target) => ({
        method: 'GET',
        relative_url:
          `${encodeURIComponent(target.postId)}/video_insights` +
          `?metric=${METRIC_TOTAL_VIDEO_VIEWS}&period=${VIDEO_INSIGHTS_PERIOD}`,
      }));

      let entries: BatchEntry[];
      try {
        entries = await this.postBatch(batch, pageAccessToken, graphVersion);
      } catch (error) {
        this.logger.warn(
          `Không lấy được lượt xem video cho ${chunk.length} bài trong lô — ` +
            `giữ nguyên số cũ: ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
        continue;
      }

      chunk.forEach((target, index) => {
        result.set(
          target.postId,
          this.readVideoViews(target.postId, entries[index]),
        );
      });
    }

    return result;
  }

  private readVideoViews(
    postId: string,
    entry: BatchEntry | undefined,
  ): number | null {
    if (entry === undefined) {
      this.logger.warn(
        `Facebook không trả kết quả video_insights cho bài ${postId} trong lô batch.`,
      );
      return null;
    }

    if (entry.code < 200 || entry.code >= 300) {
      const { message, code } = readGraphError(entry.body);
      this.logger.warn(
        `Không lấy được lượt xem video của bài ${postId}: code=${String(code)} message=${String(
          message ?? 'không rõ nguyên nhân',
        )}`,
      );
      return null;
    }

    const body =
      entry.body !== null && typeof entry.body === 'object'
        ? (entry.body as { data?: unknown })
        : {};
    const data = Array.isArray(body.data) ? body.data : [];

    const metricEntry = data.find(
      (item): item is { name: string; values?: unknown } =>
        item !== null &&
        typeof item === 'object' &&
        (item as { name?: unknown }).name === METRIC_TOTAL_VIDEO_VIEWS,
    );
    if (metricEntry === undefined) return null;

    const values = metricEntry.values;
    const first: unknown = Array.isArray(values) ? values[0] : undefined;
    const value =
      first !== null && typeof first === 'object'
        ? (first as { value?: unknown }).value
        : undefined;

    return typeof value === 'number' ? value : null;
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
    // Bài video dùng video_id thô làm postId (xem module comment ở đầu file) —
    // node đó KHÔNG có field `insights` (Graph trả thẳng
    // "(#100) Tried accessing nonexisting field (insights)", lỗi ở CẢ request
    // chứ không phải 1 metric sai) chứ không riêng gì `post_video_views`. Đo thật
    // 2026-08-13: gửi `insights.metric()` trên video_id giết cả like/comment/
    // share theo. Video không hỏi field này; lượt xem lấy riêng ở `fetchVideoViews`.
    const unsupported = this.unsupportedFor(pageIdOf(target.postId));
    const metrics = target.isVideo
      ? []
      : [METRIC_FAN_REACH, METRIC_CLICKS].filter(
          (metric) => !unsupported.has(metric),
        );

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
    // nào — page không hỗ trợ cái nào, HOẶC bài là video (node không có field
    // này, xem `buildRelativeUrl`) — đó là trạng thái đã biết, không phải sự cố.
    const askedForMetrics =
      !target.isVideo &&
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
      // Điền sau ở `getPostInsights` bằng `fetchVideoViews` (edge riêng).
      videoViews: null,
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
