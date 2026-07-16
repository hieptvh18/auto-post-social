export type UserRole = 'ADMIN' | 'EDITOR' | 'CONTENT';

export type MediaType = 'image' | 'video';

export type ContentStatus =
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PUBLISHING'
  | 'PUBLISHED';

export type PublishStatus =
  | 'SCHEDULED'
  | 'QUEUED'
  | 'PUBLISHING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

export interface User {
  id: string;
  name?: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface FacebookPage {
  id: string;
  pageName: string;
  pageId: string;
  tokenMasked: string;
  tokenExpireAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ContentAsset {
  id: string;
  code: string;
  category: string;
  title: string;
  description: string;
  caption: string;
  hashtags?: string;
  mediaType: MediaType;
  driveFileId: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  status: ContentStatus;
  isAds: boolean;
  assignedPageIds: string[];
  publishedPageIds: string[];
  createdBy: string;
  approvedBy?: string | null;
  rejectComment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublishJob {
  id: string;
  contentAssetId: string;
  contentTitle: string;
  facebookPageId: string;
  pageName: string;
  caption: string;
  hashtags?: string;
  category?: string;
  mediaType?: MediaType;
  driveUrl?: string;
  scheduleTime: string;
  status: PublishStatus;
  publishedAt: string | null;
  errorMessage: string | null;
  attempts: number;
  facebookPostId: string | null;
  createdBy: string;
}

export type SlotMediaType = MediaType | 'all';

export interface AutoPostSlot {
  id: string;
  pageId: string;
  time: string; // 'HH:mm'
  categories: string[];
  mediaType: SlotMediaType;
  postCount: number;
  enabled: boolean;
}

export interface AutoPostConfig {
  pageId: string;
  enabled: boolean;
  slots: AutoPostSlot[];
}

export interface AuditLog {
  id: string;
  userEmail: string;
  userRole: UserRole;
  action: string;
  resource: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface DashboardStats {
  pendingReview: number;
  approved: number;
  publishing: number;
  successPosts: number;
  failedPosts: number;
  adsVideos: number;
  postsToday: number;
  postsThisMonth: number;
  activePages: number;
  activeUsers: number;
}

export interface PagePostStats {
  pageId: string;
  pageName: string;
  imagePosts: number;
  videoPosts: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
