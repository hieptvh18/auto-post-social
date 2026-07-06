export type UserRole = 'ADMIN' | 'CONTENT' | 'REVIEWER' | 'PUBLISHER';

export type MediaType = 'image' | 'video';

export type ContentStatus = 'DRAFT' | 'WAITING_APPROVAL' | 'APPROVED' | 'REJECTED';

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
  mediaType: MediaType;
  driveFileId: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  status: ContentStatus;
  createdBy: string;
  approvedBy?: string | null;
  rejectComment?: string | null;
  updatedAt: string;
  createdAt?: string;
}

export interface PublishJob {
  id: string;
  contentAssetId: string;
  contentTitle: string;
  facebookPageId: string;
  pageName: string;
  caption: string;
  hashtags?: string;
  scheduleTime: string;
  status: PublishStatus;
  publishedAt: string | null;
  errorMessage: string | null;
  attempts: number;
  facebookPostId: string | null;
  createdBy: string;
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
  waitingReview: number;
  approved: number;
  scheduled: number;
  publishing: number;
  successPosts: number;
  failedPosts: number;
  postsToday: number;
  postsThisMonth: number;
  activePages: number;
  activeUsers: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
