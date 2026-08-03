import type { ContentAsset } from '../../../generated/prisma/client';
import type {
  ContentActor,
  ContentAssetWithActors,
} from './content-assets.repository';

/** Một page mà bài được phân bổ, kèm trạng thái đã đăng hay chưa. */
export interface ContentAssignmentResponse {
  pageId: string;
  pageName: string;
  publishedAt: Date | null;
  facebookPostId: string | null;
}

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
  /** `false` = ngưng dùng: vẫn hiện ở kho (làm mờ) nhưng Bot không lấy nữa. */
  isActive: boolean;
  rejectComment: string | null;
  createdById: string;
  approvedById: string | null;
  updatedById: string | null;
  editorId: string | null;
  /** Người upload bài. */
  createdBy: ContentActor;
  /** Người sửa gần nhất — null với bài cũ có trước khi bật tracking. */
  updatedBy: ContentActor | null;
  /** Người **dựng** video/ảnh (account role EDITOR) — khác người upload. */
  editor: ContentActor | null;
  /** Page đã phân bổ (kể cả đã đăng) — nguồn cho ô "Phân bổ page" trên UI. */
  assignedPageIds: string[];
  /** Tập con của `assignedPageIds` đã đăng thành công — không gỡ được nữa. */
  publishedPageIds: string[];
  assignments: ContentAssignmentResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export function toContentAssetResponse(
  asset: ContentAssetWithActors,
): ContentAssetResponse {
  const assignments = asset.assignments;
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
    isActive: asset.isActive,
    rejectComment: asset.rejectComment,
    createdById: asset.createdById,
    approvedById: asset.approvedById,
    updatedById: asset.updatedById,
    editorId: asset.editorId,
    createdBy: toActor(asset.createdBy),
    updatedBy: asset.updatedBy === null ? null : toActor(asset.updatedBy),
    editor: asset.editor === null ? null : toActor(asset.editor),
    assignedPageIds: assignments.map((a) => a.facebookPageId),
    publishedPageIds: assignments
      .filter((a) => a.publishedAt !== null)
      .map((a) => a.facebookPageId),
    assignments: assignments.map((a) => ({
      pageId: a.facebookPageId,
      pageName: a.facebookPage.pageName,
      publishedAt: a.publishedAt,
      facebookPostId: a.facebookPostId,
    })),
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

/** Chỉ copy 3 field — chặn mọi field user khác lọt ra API. */
function toActor(actor: ContentActor): ContentActor {
  return { id: actor.id, name: actor.name, email: actor.email };
}
