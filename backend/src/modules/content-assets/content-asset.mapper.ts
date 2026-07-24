import type { ContentAsset } from '../../../generated/prisma/client';

export interface ContentAssetResponse {
  id: string;
  title: string;
  description: string | null;
  caption: string;
  hashtags: string | null;
  category: string;
  mediaType: ContentAsset['mediaType'];
  driveFileId: string;
  driveUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  status: ContentAsset['status'];
  isAds: boolean;
  rejectComment: string | null;
  createdById: string;
  approvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toContentAssetResponse(
  asset: ContentAsset,
): ContentAssetResponse {
  return {
    id: asset.id,
    title: asset.title,
    description: asset.description,
    caption: asset.caption,
    hashtags: asset.hashtags,
    category: asset.category,
    mediaType: asset.mediaType,
    driveFileId: asset.driveFileId,
    driveUrl: asset.driveUrl,
    thumbnailUrl: asset.thumbnailUrl,
    mimeType: asset.mimeType,
    fileSize: asset.fileSize === null ? null : Number(asset.fileSize),
    status: asset.status,
    isAds: asset.isAds,
    rejectComment: asset.rejectComment,
    createdById: asset.createdById,
    approvedById: asset.approvedById,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}
