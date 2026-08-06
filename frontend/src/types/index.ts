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

/** Response `/users` (backend `UserResponse`) — không bao giờ chứa passwordHash. */
export interface UserResponse {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedUsers {
  data: UserResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Query `GET /users`. */
export interface QueryUsersParams {
  role?: UserRole;
  search?: string;
  page?: number;
  limit?: number;
}

/** Body `POST /users` — `name` bắt buộc, password 8–72 ký tự. */
export interface CreateUserBody {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

/** Body `PUT /users/:id` — mọi field optional, chỉ gửi field đổi. */
export interface UpdateUserBody {
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  isActive?: boolean;
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
  /** Nguồn token: dán tay hay lấy qua đăng nhập Facebook (plan 15). */
  connectMode: FacebookConnectMode;
  /** null với page dán tay — chỉ page FB_LOGIN mới "lấy lại token" được. */
  connectionId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

/** Nguồn Page Access Token. */
export type FacebookConnectMode = 'MANUAL_TOKEN' | 'FB_LOGIN';

/** Một tài khoản Facebook đã đăng nhập (`GET /pages/connect`). */
export interface FacebookConnectionResponse {
  id: string;
  fbUserId: string;
  fbUserName: string | null;
  /** null = user token không hết hạn. */
  tokenExpireAt: string | null;
  /** null khi không có hạn; âm nghĩa là đã hết hạn. */
  daysUntilExpire: number | null;
  scopes: string[];
  pageCount: number;
  connectedById: string;
  createdAt: string;
  updatedAt: string;
}

/** Page mà tài khoản đã kết nối nhìn thấy (`GET /pages/connect/:id/candidates`). */
export interface FacebookPageCandidate {
  pageId: string;
  pageName: string | null;
  category: string | null;
  /** Tài khoản có quyền tạo nội dung trên page này hay không. */
  canPost: boolean;
  alreadyAdded: boolean;
  currentConnectMode: FacebookConnectMode | null;
  /** false ⇒ khoá dòng lại, lý do ở `blockedReason`. */
  importable: boolean;
  blockedReason: string | null;
}

/** Body `POST /pages/connect/:id/import`. */
export interface ImportPagesBody {
  pageIds: string[];
  /** true = đồng ý thay token dán tay hiện có bằng token đăng nhập. */
  overwriteManual?: boolean;
}

/** Kết quả import — 3 nhóm tách bạch để nói đúng chuyện gì đã xảy ra. */
export interface ImportPagesResult {
  imported: FacebookPageResponse[];
  skipped: { pageId: string; reason: string }[];
  needsConfirm: { pageId: string; pageName: string }[];
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

/** Vì sao mốc giờ này đăng được / không đăng được (backend `SlotReadiness`). */
export type SlotReadinessStatus =
  | 'READY'
  | 'NO_ASSIGNMENT'
  | 'NO_MATCH'
  | 'PAUSED';

export interface SlotReadiness {
  status: SlotReadinessStatus;
  /** Câu giải thích + cách sửa, hiển thị thẳng lên UI. `null` khi READY. */
  message: string | null;
}

/** Lần cron gần nhất chạm mốc giờ này trong hôm nay. */
export interface SlotLastRun {
  status: SlotRunStatus;
  runDate: string;
  runTime: string;
  pickedCount: number;
  jobCreatedCount: number;
  skipReason: string | null;
  errorMessage: string | null;
  startedAt: string;
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
  /** Số bài trong kho đăng được cho mốc này (đúng điều kiện picker của Bot). */
  readyCount: number;
  readiness: SlotReadiness;
  /** `null` = hôm nay cron chưa chạy mốc này. */
  lastRun: SlotLastRun | null;
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

/**
 * `GET /auto-post-configs/:pageId/category-availability` — kho bài Bot còn đăng
 * được cho page này, tách theo danh mục. Đếm đúng điều kiện picker (đã phân bổ,
 * chưa đăng lên page này, đã duyệt, không có job đang chạy).
 */
export interface CategoryAvailability {
  category: string;
  imageCount: number;
  videoCount: number;
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

/** Tiến độ một mốc giờ trong ngày (backend `SlotProgress`). */
export type SlotProgress =
  | 'PENDING'
  | 'RUNNING'
  | 'DONE'
  | 'PARTIAL'
  | 'FAILED'
  | 'MISSED'
  | 'NO_CONTENT'
  | 'PAUSED';

/** Một job trong màn "Lịch đăng bài" (backend `ScheduleJobResponse`). */
export interface ScheduleJob {
  id: string;
  contentAssetId: string;
  contentTitle: string;
  category: string;
  mediaType: MediaType;
  driveUrl: string | null;
  thumbnailUrl: string | null;
  caption: string;
  hashtags: string | null;
  status: PublishStatus;
  scheduleTime: string;
  publishedAt: string | null;
  facebookPostId: string | null;
  errorMessage: string | null;
  attemptCount: number;
  /** Tên người đăng — 'Bot' nếu do engine tự động, còn lại là user đăng tay. */
  publishedBy: string;
  isManual: boolean;
}

/** Trạng thái một lần cron chạm mốc giờ (backend `SlotRunStatus`). */
export type SlotRunStatus = 'CLAIMED' | 'DONE' | 'SKIPPED' | 'ERROR';

/** Dấu vết cron đã chạy mốc giờ này trong ngày (backend `SlotRunSummary`). */
export interface SlotRunSummary {
  status: SlotRunStatus;
  pickedCount: number;
  jobCreatedCount: number;
  skipReason: string | null;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}

/** Một mốc giờ của một page trong ngày (backend `ScheduleItemResponse`). */
export interface ScheduleItem {
  key: string;
  kind: 'slot' | 'manual';
  time: string;
  slotId: string | null;
  pageId: string;
  facebookPageId: string;
  pageName: string;
  pageIsActive: boolean;
  autopostEnabled: boolean;
  slotEnabled: boolean;
  categories: string[];
  mediaType: SlotMediaType | null;
  plannedCount: number;
  successCount: number;
  failedCount: number;
  runningCount: number;
  readyCount: number | null;
  progress: SlotProgress;
  /** `null` = cron chưa chạy mốc này (khác `status: 'SKIPPED'` = chạy nhưng hết bài). */
  slotRun: SlotRunSummary | null;
  publishers: string[];
  jobs: ScheduleJob[];
}

export interface PublishScheduleSummary {
  plannedPosts: number;
  activeSlots: number;
  pagesAutoOn: number;
  successPosts: number;
  failedPosts: number;
  runningPosts: number;
  manualPosts: number;
}

/** Response `GET /publish-schedule`. */
export interface PublishScheduleResponse {
  date: string;
  timezone: string;
  summary: PublishScheduleSummary;
  items: ScheduleItem[];
}

/** Query `GET /publish-schedule`. */
export interface QueryPublishScheduleParams {
  date?: string;
  pageId?: string;
  status?: PublishStatus;
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

/* ─────────────── Tổng quan (Dashboard) — response backend thật ─────────────── */

export interface DashboardRangeInfo {
  from: string;
  to: string;
}

/** Tồn kho **hiện tại** — KHÔNG phụ thuộc khoảng ngày đang chọn. */
export interface DashboardInventory {
  pendingReview: number;
  approved: number;
  rejected: number;
  /** Đã duyệt nhưng chưa phân bổ page nào ⇒ Bot không lấy được. */
  approvedUnassigned: number;
}

/** Sản lượng **trong kỳ** đang chọn. */
export interface DashboardProduction {
  newContent: number;
  adsVideos: number;
  successPosts: number;
  failedPosts: number;
  /** `null` = chưa có job nào đóng sổ (khác hẳn 0 = hỏng sạch). */
  successRate: number | null;
}

/** Số liệu **ngay lúc này**. `activeUsers` = `null` khi role không được xem. */
export interface DashboardLive {
  publishing: number;
  activePages: number;
  autopostEnabledPages: number;
  activeUsers: number | null;
}

export interface DashboardStats {
  range: DashboardRangeInfo;
  /** `true` = số liệu chỉ tính trên bài của chính người đang xem (role CONTENT). */
  scopedToOwnContent: boolean;
  inventory: DashboardInventory;
  production: DashboardProduction;
  live: DashboardLive;
}

export interface DailyChartItem {
  date: string;
  success: number;
  failed: number;
}

export interface DailyChart {
  range: DashboardRangeInfo;
  items: DailyChartItem[];
}

export interface PagePostStats {
  pageId: string;
  pageName: string;
  imagePosts: number;
  videoPosts: number;
  failedPosts: number;
}

export interface PostsByPage {
  range: DashboardRangeInfo;
  items: PagePostStats[];
}

export interface TopCategoryItem {
  category: string;
  successPosts: number;
  /** Số page KHÁC NHAU đã đăng thành công danh mục này. */
  pageCount: number;
}

export interface TopCategories {
  range: DashboardRangeInfo;
  items: TopCategoryItem[];
}

export type DashboardAlertCode =
  | 'FAILED_JOBS'
  | 'STUCK_JOBS'
  | 'MISSED_SLOTS'
  | 'EMPTY_POOL'
  | 'TOKEN_EXPIRING';

export interface DashboardAlert {
  level: 'error' | 'warning';
  code: DashboardAlertCode;
  count: number;
  message: string;
  /** Màn xử lý được việc này — luôn có, để bấm đi tiếp ngay. */
  link: string;
}

export interface DashboardHealth {
  checkedAt: string;
  /** Rỗng = hệ thống đang chạy bình thường. */
  alerts: DashboardAlert[];
}

/** Query chung của mọi endpoint Dashboard (ngày `YYYY-MM-DD`, giờ VN). */
export interface QueryDashboardParams {
  from?: string;
  to?: string;
}

export interface QueryPostsByPageParams extends QueryDashboardParams {
  mediaType?: MediaType | 'all';
}

export interface QueryTopCategoriesParams extends QueryDashboardParams {
  /** Bỏ trống = 10 (mặc định của backend). */
  limit?: number;
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

/** Response `GET/PUT /settings/facebook-app` (backend `FacebookAppSettingsResponse`). */
export interface FacebookAppSettingsResponse {
  appId: string | null;
  hasAppSecret: boolean;
  /** Chuỗi phải khai trong Meta app → Facebook Login → Valid OAuth Redirect URIs. */
  redirectUri: string;
  usingEnvFallback: boolean;
  updatedAt: string | null;
}

/** Body `PUT /settings/facebook-app` — không gửi `appSecret` = giữ nguyên cái đã lưu. */
export interface UpdateFacebookAppSettingsBody {
  appId: string;
  appSecret?: string | null;
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
/** Người liên quan tới content (upload/sửa) — subset an toàn của user. */
export interface ContentActor {
  id: string;
  name: string;
  email: string;
}

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
  /** `false` = ngưng dùng: vẫn hiện trong kho (làm mờ) nhưng Bot không lấy nữa. */
  isActive: boolean;
  rejectComment: string | null;
  createdById: string;
  approvedById: string | null;
  /** Người **dựng** video/ảnh (account role EDITOR) — `null` nếu chưa gán. */
  editorId: string | null;
  /** Người upload bài. */
  createdBy: ContentActor;
  /** Người sửa gần nhất — `null` với bài cũ trước khi có tracking. */
  updatedBy: ContentActor | null;
  /** Người dựng video/ảnh — khác `createdBy` (người upload lên hệ thống). */
  editor: ContentActor | null;
  /** Page bài được phân bổ (kể cả đã đăng). */
  assignedPageIds: string[];
  /** Tập con đã đăng thành công — UI khoá không cho gỡ. */
  publishedPageIds: string[];
  assignments: ContentAssignmentResponse[];
  /** Tổng số ảnh của bài: 1 = bài thường, >1 ⇒ đăng thành 1 bài Facebook nhiều ảnh. */
  imageCount: number;
  /** Ảnh phụ theo thứ tự đăng (rỗng với bài 1 ảnh). Cố định lúc upload. */
  extraFiles: ContentAssetFileResponse[];
  createdAt: string;
  updatedAt: string;
}

/** Một ảnh phụ của bài nhiều ảnh. `position` bắt đầu từ 1 (ảnh đầu là chính bài). */
export interface ContentAssetFileResponse {
  id: string;
  position: number;
  driveFileId: string;
  driveUrl: string | null;
  thumbnailUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
}

/** Một page bài được phân bổ, kèm trạng thái đã đăng hay chưa. */
export interface ContentAssignmentResponse {
  pageId: string;
  pageName: string;
  publishedAt: string | null;
  facebookPostId: string | null;
}

/** `GET /content-assets/hashtags` — gợi ý cho ô nhập nhanh hashtag. */
export interface HashtagSuggestion {
  tag: string;
  count: number;
}

/** Kết quả một thao tác hàng loạt (backend `BulkResult`, plan 19 §2.3). */
export interface BulkItemFailure {
  id: string;
  /** Tiêu đề bài — id trần thì người dùng không biết là bài nào. */
  label: string;
  reason: string;
}

export interface BulkResult {
  requested: number;
  succeeded: string[];
  failed: BulkItemFailure[];
}

/** `GET /content-assets/editors` — account cho ô "Editor" (kể cả đã vô hiệu hoá). */
export interface EditorOption {
  id: string;
  name: string;
  email: string;
  /** `false` = đã vô hiệu hoá: lọc được nhưng không gán mới được. */
  isActive: boolean;
}

/** `GET /content-assets/categories` — danh mục ("Dạng") đang dùng trong kho. */
export interface CategorySuggestion {
  category: string;
  count: number;
}

export interface PaginatedContentAssets {
  data: ContentAssetResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Query `GET /content-assets`. */
/** Bộ lọc "Phân bổ page" ở màn Quản lý Ảnh/Video Edit. */
export type AssignmentFilter = 'assigned' | 'unassigned';

export interface QueryContentAssetsParams {
  mediaType?: MediaType;
  assignment?: AssignmentFilter;
  category?: string;
  status?: ContentStatus;
  isAds?: boolean;
  /** Lọc "Đang dùng / Ngưng dùng"; bỏ trống ⇒ lấy cả hai. */
  isActive?: boolean;
  search?: string;
  createdBy?: string;
  /** Lọc theo người dựng video/ảnh. */
  editorId?: string;
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
  /** Người dựng video/ảnh — không bắt buộc. */
  editorId?: string;
  assignedPageIds?: string[];
  /**
   * Ảnh phụ của bài nhiều ảnh, ĐÚNG thứ tự đăng. Chỉ hợp lệ với `mediaType: 'image'`;
   * tổng số ảnh (kể cả `driveFileId` ở trên) tối đa `MAX_IMAGES_PER_CONTENT_ASSET`.
   */
  extraFiles?: CreateContentAssetFileBody[];
}

/** Một ảnh phụ lúc tạo bài — file đã đẩy lên Drive bằng `POST /media/upload`. */
export interface CreateContentAssetFileBody {
  driveFileId: string;
  driveUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  fileSize?: number;
}

/**
 * Body `PATCH /content-assets/:id`. `status`/`isAds`/`rejectComment` đòi quyền
 * `content:review` — backend trả 403 nếu CONTENT gửi lên.
 */
export interface UpdateContentAssetBody {
  title?: string;
  description?: string;
  category?: string;
  caption?: string;
  hashtags?: string;
  status?: ContentStatus;
  isAds?: boolean;
  /** `false` = ngưng dùng — không phải field duyệt, ai sửa được bài thì đổi được. */
  isActive?: boolean;
  rejectComment?: string;
  /** Người dựng video/ảnh; gửi `null` để gỡ. */
  editorId?: string | null;
  /** Gửi lên là thay thế toàn bộ phân bổ — backend tự diff. */
  assignedPageIds?: string[];
}

/** Loại sự kiện trong nhật ký kỹ thuật của publish job (backend `PublishJobEventType`). */
export type PublishJobEventType =
  | 'ENQUEUED'
  | 'STARTED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'RETRY_SCHEDULED'
  | 'GAVE_UP';

/** Một dòng nhật ký của job (`GET /publish-jobs/:id/events`). */
export interface PublishJobEvent {
  id: string;
  attemptNo: number;
  event: PublishJobEventType;
  message: string | null;
  rawError: unknown;
  createdAt: string;
}

/** Kết quả `POST /auto-post/slots/:slotId/run-now` — chạy lại một mốc giờ. */
export interface RunSlotResult {
  slotId: string;
  /** `false` = phút này mốc đó đã chạy rồi (chống chạy trùng), không tạo job mới. */
  claimed: boolean;
  pickedCount: number;
  jobCreatedCount: number;
  skipReason?: string;
}

/** Kết quả `POST /publish-jobs/:id/retry`. */
export interface RetryJobResult {
  jobId: string;
  status: PublishStatus;
  message: string;
}

/** Trang dữ liệu do backend cắt sẵn (`{ items, total, page, pageSize }`). */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Một publish job trong response `GET /publish-jobs` (backend `PublishJobResponse`). */
export interface PublishJobItem {
  id: string;
  status: PublishStatus;
  contentAssetId: string;
  contentTitle: string;
  pageId: string;
  pageName: string;
  caption: string;
  hashtags: string | null;
  scheduleTime: string;
  publishedAt: string | null;
  facebookPostId: string | null;
  errorMessage: string | null;
  attemptCount: number;
  createdBy: string;
  createdAt: string;
}

/** Query `GET /publish-jobs` — `date` = 1 ngày, `from`/`to` = khoảng ngày. */
export interface QueryPublishJobsParams {
  date?: string;
  from?: string;
  to?: string;
  pageId?: string;
  status?: PublishStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** Số job trong BullMQ (Redis) — `null` khi không đọc được Redis. */
export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

/** Job kẹt ở PUBLISHING quá lâu ⇒ nghi worker chết giữa chừng. */
export interface StuckJob {
  id: string;
  contentTitle: string;
  pageName: string;
  status: PublishStatus;
  stuckMinutes: number;
  updatedAt: string;
}

/** Response `GET /monitor/queue/summary`. */
export interface QueueSummary {
  queue: QueueCounts | null;
  queueHealthy: boolean;
  queueError: string | null;
  /** Đếm theo trạng thái trong DB — lệch với `queue` là dấu hiệu Redis bị flush. */
  db: Record<PublishStatus, number>;
  stuck: StuckJob[];
  stuckThresholdMinutes: number;
  activeJobs: PublishJobItem[];
  checkedAt: string;
}

/** Người thực hiện một thao tác trong audit log. */
export interface AuditLogActor {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

/** Một dòng `GET /audit-logs` (backend `AuditLogResponse`). */
export interface AuditLogItem {
  id: string;
  action: string;
  resource: string;
  /** `null` = do Bot/cron làm. */
  actor: AuditLogActor | null;
  /** JSONB tự do, backend đã lọc secret thành `'***'`. */
  beforeValue: unknown;
  afterValue: unknown;
  ipAddress: string | null;
  createdAt: string;
}

/** Query `GET /audit-logs`. */
export interface QueryAuditLogsParams {
  action?: string;
  userId?: string;
  resource?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
