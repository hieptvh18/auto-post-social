import type { ContentAsset } from '../../../generated/prisma/client';
import type {
  ContentActor,
  ContentAssetExtraFile,
  ContentAssetWithActors,
} from './content-assets.repository';

/** Một ảnh phụ của bài nhiều ảnh (plan 22). `position` bắt đầu từ 1. */
export interface ContentAssetFileResponse {
  id: string;
  position: number;
  driveFileId: string;
  driveUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
}

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
  /**
   * Tổng số ảnh của bài (1 = bài thường, >1 = bài nhiều ảnh ⇒ đăng thành 1 bài
   * album). Đủ để bảng danh sách hiện badge "+N ảnh" mà không phải trả cả mảng.
   */
  imageCount: number;
  /** Ảnh phụ theo thứ tự đăng — Drawer chi tiết dùng để xem trước. */
  extraFiles: ContentAssetFileResponse[];
  createdAt: Date;
  updatedAt: Date;
}

export function toContentAssetResponse(
  asset: ContentAssetWithActors,
): ContentAssetResponse {
  const assignments = asset.assignments;
  // Bài cũ (trước plan 22) không có quan hệ này khi caller quên include ⇒ coi như 1 ảnh.
  const extraFiles = asset.extraFiles ?? [];
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
    imageCount: 1 + extraFiles.length,
    extraFiles: extraFiles.map(toExtraFile),
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

function toExtraFile(file: ContentAssetExtraFile): ContentAssetFileResponse {
  return {
    id: file.id,
    position: file.position,
    driveFileId: file.driveFileId,
    driveUrl: file.driveUrl,
    thumbnailUrl: file.thumbnailUrl,
    mimeType: file.mimeType,
    fileSize: file.fileSize === null ? null : Number(file.fileSize),
  };
}

/** Chỉ copy 3 field — chặn mọi field user khác lọt ra API. */
function toActor(actor: ContentActor): ContentActor {
  return { id: actor.id, name: actor.name, email: actor.email };
}
