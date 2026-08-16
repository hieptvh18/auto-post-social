import type {
  ReupPlatform,
  ReupVideoStatus,
} from '../../../generated/prisma/client';
import type { ReupVideoWithTopic } from './reup-videos.repository';

export interface ReupVideoResponse {
  id: string;
  topicId: string;
  topicName: string;
  platform: ReupPlatform;
  externalId: string;
  sourceUrl: string;
  title: string;
  authorName: string;
  publishedAt: Date | null;
  durationSec: number | null;
  /**
   * `BigInt` không serialize được sang JSON ⇒ đổi sang `number`. An toàn: view
   * của YouTube tối đa ~10^10, còn xa `Number.MAX_SAFE_INTEGER` (~9×10^15).
   */
  viewCount: number | null;
  thumbnailUrl: string | null;
  status: ReupVideoStatus;
  fileSize: number | null;
  /** Có giá trị khi `status = IMPORTED` — link sang bài trong kho. */
  contentAssetId: string | null;
  /** != null = cron dọn dẹp đã xoá file Drive của bài này (plan 30). */
  resourceDeletedAt: Date | null;
  errorMessage: string | null;
  attemptCount: number;
  discoveredAt: Date;
}

export function toReupVideoResponse(
  video: ReupVideoWithTopic,
): ReupVideoResponse {
  return {
    id: video.id,
    topicId: video.topicId,
    topicName: video.topic.name,
    platform: video.platform,
    externalId: video.externalId,
    sourceUrl: video.sourceUrl,
    title: video.title,
    authorName: video.authorName,
    publishedAt: video.publishedAt,
    durationSec: video.durationSec,
    viewCount: video.viewCount === null ? null : Number(video.viewCount),
    thumbnailUrl: video.thumbnailUrl,
    status: video.status,
    fileSize: video.fileSize === null ? null : Number(video.fileSize),
    contentAssetId: video.contentAssetId,
    resourceDeletedAt: video.contentAsset?.resourceDeletedAt ?? null,
    errorMessage: video.errorMessage,
    attemptCount: video.attemptCount,
    discoveredAt: video.discoveredAt,
    // `localPath` cố ý KHÔNG trả ra API: đó là đường dẫn nội bộ trên server,
    // lộ ra ngoài không giúp gì cho người dùng mà chỉ tiết lộ cấu trúc máy chủ.
  };
}
