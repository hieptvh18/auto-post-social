export type UserRole = 'ADMIN' | 'CONTENT' | 'PUBLISHER' | 'VIEWER';

export type MediaType = 'image' | 'video';

export type PublishStatus =
  | 'DRAFT'
  | 'APPROVED'
  | 'QUEUED'
  | 'PUBLISHING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED';

export interface User {
  id: string;
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
  sheetRowId: string;
  category: string;
  title: string;
  caption: string;
  mediaType: MediaType;
  driveUrl: string;
  approved: boolean;
  owner: string;
  updatedAt: string;
}

export interface PublishJob {
  id: string;
  contentAssetId: string;
  contentTitle: string;
  facebookPageId: string;
  pageName: string;
  scheduledAt: string;
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
  totalPosts: number;
  successPosts: number;
  failedPosts: number;
  activePages: number;
  activeUsers: number;
  queuedPosts: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}
