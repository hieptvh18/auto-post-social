/** Tồn kho **hiện tại** — không phụ thuộc khoảng ngày đã chọn (plan 14 §3.2). */
export interface DashboardInventory {
  pendingReview: number;
  approved: number;
  rejected: number;
  approvedUnassigned: number;
}

/** Sản lượng **trong kỳ** đã chọn. */
export interface DashboardProduction {
  newContent: number;
  adsVideos: number;
  successPosts: number;
  failedPosts: number;
  /** `null` khi chưa có job nào đóng sổ — không phải `0` (0 nghĩa là hỏng hết). */
  successRate: number | null;
}

/** Số liệu **ngay lúc này**. `activeUsers` = `null` với role không được xem. */
export interface DashboardLive {
  publishing: number;
  activePages: number;
  autopostEnabledPages: number;
  activeUsers: number | null;
}

export interface DashboardStats {
  range: { from: string; to: string };
  /** `true` khi số liệu chỉ tính trên bài của chính người đang xem (role CONTENT). */
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
  range: { from: string; to: string };
  items: DailyChartItem[];
}

export interface PostsByPageItem {
  pageId: string;
  pageName: string;
  imagePosts: number;
  videoPosts: number;
  failedPosts: number;
}

export interface PostsByPage {
  range: { from: string; to: string };
  items: PostsByPageItem[];
}

export const AlertLevel = {
  error: 'error',
  warning: 'warning',
} as const;

export type AlertLevelValue = (typeof AlertLevel)[keyof typeof AlertLevel];

export const AlertCode = {
  FAILED_JOBS: 'FAILED_JOBS',
  STUCK_JOBS: 'STUCK_JOBS',
  MISSED_SLOTS: 'MISSED_SLOTS',
  EMPTY_POOL: 'EMPTY_POOL',
  TOKEN_EXPIRING: 'TOKEN_EXPIRING',
} as const;

export type AlertCodeValue = (typeof AlertCode)[keyof typeof AlertCode];

export interface DashboardAlert {
  level: AlertLevelValue;
  code: AlertCodeValue;
  count: number;
  message: string;
  /** Màn xử lý được việc này — cảnh báo không có đường đi tiếp là vô dụng. */
  link: string;
}

export interface DashboardHealth {
  checkedAt: Date;
  /** Rỗng = mọi thứ đang chạy bình thường. Không đẻ alert giả để lấp chỗ trống. */
  alerts: DashboardAlert[];
}
