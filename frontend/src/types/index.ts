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

/** Response `GET /pages` (backend `FacebookPageResponse`) — token luôn ở dạng mask. */
export interface FacebookPageResponse {
  id: string;
  pageName: string;
  pageId: string;
  accessTokenMasked: string;
  tokenExpireAt: string | null;
  isActive: boolean;
  autopostEnabled: boolean;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/** Body `POST /pages`. */
export interface CreateFacebookPageBody {
  pageName: string;
  pageId: string;
  accessToken: string;
  tokenExpireAt?: string;
}

/** Body `POST /pages/test-connection` — test cấu hình chưa lưu. */
export interface TestPageConnectionBody {
  pageId: string;
  accessToken: string;
}

/** Kết quả test kết nối page — sai cấu hình vẫn trả 200 với `ok:false`. */
export interface PageConnectionResult {
  ok: boolean;
  pageId: string;
  pageName: string | null;
  category: string | null;
  canPost: boolean;
  /** Chỉ token loại `PAGE` mới đăng bài được với tư cách page. */
  tokenType: 'PAGE' | 'USER' | 'SYSTEM_USER' | 'APP' | 'UNKNOWN';
  /** `null` = token không hết hạn (System User). */
  expiresAt: string | null;
  message: string;
}

/** Body `PUT /pages/:id` — `accessToken` chỉ gửi khi đổi token. */
export interface UpdateFacebookPageBody {
  pageName?: string;
  accessToken?: string;
  tokenExpireAt?: string;
  autopostEnabled?: boolean;
  isActive?: boolean;
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

/** Response slot từ backend (`AutoPostSlotResponse`). */
export interface AutoPostSlotResponse {
  id: string;
  pageId: string;
  time: string; // 'HH:mm' theo Asia/Ho_Chi_Minh
  categories: string[];
  mediaType: SlotMediaType;
  postCount: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Response `GET /auto-post-configs` (backend `AutoPostConfigResponse`). */
export interface AutoPostConfigResponse {
  /** UUID page trong hệ thống. */
  pageId: string;
  pageName: string;
  /** Page id phía Meta. */
  facebookPageId: string;
  enabled: boolean;
  isActive: boolean;
  slots: AutoPostSlotResponse[];
}

/** Response `PATCH /auto-post-configs/:pageId` — kèm cảnh báo mềm. */
export interface UpdateAutoPostConfigResponse extends AutoPostConfigResponse {
  warning: string | null;
}

/** Body `POST /auto-post-configs/:pageId/slots`. */
export interface CreateAutoPostSlotBody {
  time: string;
  categories: string[];
  mediaType: SlotMediaType;
  postCount: number;
  enabled?: boolean;
}

/** Body `PATCH /auto-post-slots/:slotId` — mọi field optional. */
export type UpdateAutoPostSlotBody = Partial<CreateAutoPostSlotBody>;

/** Body `POST /manual-post` — đăng ngay 1 bài lên 1 page. */
export interface ManualPostBody {
  /** UUID page trong hệ thống (không phải page id của Meta). */
  pageId: string;
  contentAssetId: string;
  /** Caption cho riêng lần đăng này — không ghi đè caption gốc của bài. */
  caption: string;
  hashtags?: string;
}

/** Response `POST /manual-post` (backend `ManualPostResult`). */
export interface ManualPostResponse {
  jobId: string;
  contentAssetId: string;
  pageId: string;
  pageName: string;
  facebookPostId: string;
  publishedAt: string;
  message: string;
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
  name?: string;
  role: UserRole;
}

/** Response `POST /auth/login`. */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

/** Response `POST /media/upload` (backend `UploadResult`). */
export interface MediaUploadResult {
  fileId: string;
  driveUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string;
  size: number;
  mediaType: MediaType;
}

export type DriveAuthMode = 'service_account' | 'oauth2';

/** Response `GET/PUT /settings/google-drive` (backend `DriveSettingsResponse`). */
export interface DriveSettingsResponse {
  authMode: DriveAuthMode;
  folderId: string | null;
  maxUploadMb: number;
  // service_account
  hasServiceAccount: boolean;
  serviceAccountEmail: string | null;
  // oauth2
  hasOauthClient: boolean;
  oauthConnected: boolean;
  oauthAccountEmail: string | null;
  usingEnvFallback: boolean;
  updatedAt: string | null;
}

/** Body `PUT /settings/google-drive`. */
export interface UpdateDriveSettingsBody {
  authMode: DriveAuthMode;
  folderId?: string | null;
  serviceAccountJson?: string | null;
  oauthClientId?: string | null;
  oauthClientSecret?: string | null;
  maxUploadMb: number;
}

/** Response `POST /settings/google-drive/test` (backend `DriveConnectionResult`). */
export interface DriveConnectionResult {
  ok: boolean;
  authMode: DriveAuthMode;
  message: string;
}

/**
 * Response `/content-assets` (backend `ContentAssetResponse`) — giai đoạn 1: chưa
 * có `assignedPageIds`/`publishedPageIds` (chờ giai đoạn 2, xem plan 04).
 */
export interface ContentAssetResponse {
  id: string;
  title: string;
  description: string | null;
  caption: string;
  hashtags: string | null;
  category: string;
  mediaType: MediaType;
  driveFileId: string;
  driveUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  status: ContentStatus;
  isAds: boolean;
  rejectComment: string | null;
  createdById: string;
  approvedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedContentAssets {
  data: ContentAssetResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Query `GET /content-assets`. */
export interface QueryContentAssetsParams {
  mediaType?: MediaType;
  category?: string;
  search?: string;
  createdBy?: string;
  page?: number;
  limit?: number;
}

/** Body `POST /content-assets` — dùng metadata trả về từ `mediaApi.upload`. */
export interface CreateContentAssetBody {
  title: string;
  description?: string;
  category: string;
  caption: string;
  hashtags?: string;
  mediaType: MediaType;
  driveFileId: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileSize?: number;
}

/** Body `PATCH /content-assets/:id` — giai đoạn 1 chỉ field mô tả thường. */
export interface UpdateContentAssetBody {
  title?: string;
  description?: string;
  category?: string;
  caption?: string;
  hashtags?: string;
}
