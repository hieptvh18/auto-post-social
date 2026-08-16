import { ReupPlatform, type ReupTopic } from '../../../generated/prisma/client';

export interface ReupTopicResponse {
  id: string;
  name: string;
  platform: ReupPlatform;
  keywords: string[];
  regionCode: string;
  category: string;
  dailyQuota: number;
  minViewCount: number;
  maxAgeDays: number;
  minDurationSec: number;
  maxDurationSec: number;
  autoApprove: boolean;
  captionTemplate: string | null;
  hashtags: string | null;
  isActive: boolean;
  /**
   * `false` = nền tảng khai báo được nhưng cron sẽ bỏ qua (QĐ-2). Tính ở BE để
   * UI không phải nhớ danh sách nền tảng nào đã hỗ trợ — thêm Douyin sau này
   * chỉ sửa một chỗ.
   */
  isPlatformSupported: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Giai đoạn này chỉ YouTube chạy thật (QĐ-2). */
export function isPlatformSupported(platform: ReupPlatform): boolean {
  return platform === ReupPlatform.YOUTUBE;
}

export function toReupTopicResponse(topic: ReupTopic): ReupTopicResponse {
  return {
    id: topic.id,
    name: topic.name,
    platform: topic.platform,
    keywords: topic.keywords,
    regionCode: topic.regionCode,
    category: topic.category,
    dailyQuota: topic.dailyQuota,
    minViewCount: topic.minViewCount,
    maxAgeDays: topic.maxAgeDays,
    minDurationSec: topic.minDurationSec,
    maxDurationSec: topic.maxDurationSec,
    autoApprove: topic.autoApprove,
    captionTemplate: topic.captionTemplate,
    hashtags: topic.hashtags,
    isActive: topic.isActive,
    isPlatformSupported: isPlatformSupported(topic.platform),
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
  };
}
