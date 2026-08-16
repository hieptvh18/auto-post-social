import type { ReupVideoCandidate } from '../../infra/reup-downloader/reup-downloader.interface';

/**
 * Bộ lọc + xếp hạng video ứng viên (plan 29 §3.2 bước 7-8).
 *
 * **Hàm thuần, không I/O** — đây là "picker" của reup, tương đương
 * `content-picker` của auto-post, nên rule 02 xếp vào vùng **bắt buộc test kỹ**:
 * lọc sai ⇒ tải nhầm/tải trùng/tải rác lên Page thật.
 */

export interface ReupFilterCriteria {
  /** `externalId` đã có trong `reup_videos` ⇒ loại (CHỐNG TẢI TRÙNG, QĐ-4). */
  knownExternalIds: ReadonlySet<string>;
  minViewCount: number;
  minDurationSec: number;
  maxDurationSec: number;
  maxAgeDays: number;
  /** Lấy tối đa bao nhiêu video — `topic.dailyQuota`. */
  limit: number;
  /** Mốc "bây giờ" để tính tuổi video. Inject để test bằng clock giả. */
  now: Date;
}

/** Vì sao một video bị loại — dùng cho log/nhật ký, không lưu DB. */
export type ReupRejectReason =
  | 'ALREADY_KNOWN'
  | 'LOW_VIEW'
  | 'DURATION_OUT_OF_RANGE'
  | 'TOO_OLD'
  | 'MISSING_ID';

export interface ReupFilterResult {
  picked: ReupVideoCandidate[];
  rejected: { video: ReupVideoCandidate; reason: ReupRejectReason }[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Thứ tự kiểm cố ý đi từ **rẻ tới đắt** (plan 29 §3.2): kiểm tra tập id đã biết
 * trước, rồi mới tới so sánh ngày tháng.
 *
 * Quy ước `null` (plan 28): `viewCount`/`durationSec` = `null` nghĩa là **không
 * đo được**, không phải 0.
 * - `viewCount = null` ⇒ **giữ lại** khi `minViewCount = 0`, còn lại thì loại:
 *   không chứng minh được nó đạt ngưỡng thì không nên tự động đăng lên Page.
 * - `durationSec = null` ⇒ **loại**: không biết dài bao nhiêu thì có thể là
 *   video 3 tiếng hoặc livestream, tải về là phí băng thông và đĩa.
 */
export function filterReupCandidates(
  candidates: readonly ReupVideoCandidate[],
  criteria: ReupFilterCriteria,
): ReupFilterResult {
  const rejected: ReupFilterResult['rejected'] = [];
  const survivors: ReupVideoCandidate[] = [];
  // Nguồn có thể trả trùng id trong cùng một lượt — chặn luôn ở đây, nếu không
  // sẽ tạo 2 `reup_videos` rồi vỡ UNIQUE(platform, external_id) ở bước INSERT.
  const seenInThisRun = new Set<string>();

  const oldestAllowed = new Date(
    criteria.now.getTime() - criteria.maxAgeDays * MS_PER_DAY,
  );

  for (const video of candidates) {
    if (video.externalId === '') {
      rejected.push({ video, reason: 'MISSING_ID' });
      continue;
    }
    if (
      criteria.knownExternalIds.has(video.externalId) ||
      seenInThisRun.has(video.externalId)
    ) {
      rejected.push({ video, reason: 'ALREADY_KNOWN' });
      continue;
    }
    if (!passesViewCount(video.viewCount, criteria.minViewCount)) {
      rejected.push({ video, reason: 'LOW_VIEW' });
      continue;
    }
    if (
      !passesDuration(
        video.durationSec,
        criteria.minDurationSec,
        criteria.maxDurationSec,
      )
    ) {
      rejected.push({ video, reason: 'DURATION_OUT_OF_RANGE' });
      continue;
    }
    if (!passesAge(video.publishedAt, oldestAllowed)) {
      rejected.push({ video, reason: 'TOO_OLD' });
      continue;
    }

    seenInThisRun.add(video.externalId);
    survivors.push(video);
  }

  // Nhiều view nhất trước — `null` xuống cuối (chỉ lọt tới đây khi minView = 0).
  survivors.sort((a, b) => (b.viewCount ?? -1) - (a.viewCount ?? -1));

  return { picked: survivors.slice(0, Math.max(0, criteria.limit)), rejected };
}

function passesViewCount(
  viewCount: number | null,
  minViewCount: number,
): boolean {
  if (viewCount === null) return minViewCount === 0;
  return viewCount >= minViewCount;
}

function passesDuration(
  durationSec: number | null,
  minSec: number,
  maxSec: number,
): boolean {
  if (durationSec === null) return false;
  return durationSec >= minSec && durationSec <= maxSec;
}

/**
 * `publishedAt = null` ⇒ **giữ lại**: nguồn không trả ngày đăng không phải lỗi
 * của video, và bộ lọc `publishedAfter` đã áp ở tầng YouTube API rồi. Khác với
 * duration — thiếu duration là rủi ro thật (tải nhầm video 3 tiếng).
 */
function passesAge(publishedAt: string | null, oldestAllowed: Date): boolean {
  if (publishedAt === null) return true;
  const published = new Date(publishedAt);
  if (Number.isNaN(published.getTime())) return true;
  return published >= oldestAllowed;
}
