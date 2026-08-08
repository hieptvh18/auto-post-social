import type {
  FacebookConnectMode,
  FacebookPage,
} from '../../../generated/prisma/client';

export interface FacebookPageResponse {
  id: string;
  pageName: string;
  pageId: string;
  accessTokenMasked: string;
  tokenExpireAt: Date | null;
  isActive: boolean;
  autopostEnabled: boolean;
  /** Nguồn token: dán tay hay lấy qua đăng nhập Facebook (plan 15). */
  connectMode: FacebookConnectMode;
  /** null với page dán tay — chỉ page FB_LOGIN mới "lấy lại token" được. */
  connectionId: string | null;
  /**
   * Token có scope `read_insights` để đọc số liệu bài đăng hay không (plan 25).
   *
   * `null` = **không biết** — page dán token tay, hệ thống không giữ danh sách
   * scope của nó. UI chỉ được cảnh báo khi giá trị là `false`; coi `null` như
   * `false` sẽ báo động giả trên mọi page MANUAL_TOKEN.
   */
  canReadInsights: boolean | null;
  /** Số bài do tool đăng lên page này — nguồn của màn thống kê (plan 25 §0.1). */
  publishedPostCount?: number;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Không bao giờ nhận `accessTokenEnc` — chỉ nhận mask đã tính sẵn ở service. */
export function toFacebookPageResponse(
  page: FacebookPage,
  accessTokenMasked: string,
  insightsMeta?: {
    canReadInsights: boolean | null;
    publishedPostCount: number;
  },
): FacebookPageResponse {
  return {
    id: page.id,
    pageName: page.pageName,
    pageId: page.pageId,
    accessTokenMasked,
    tokenExpireAt: page.tokenExpireAt,
    isActive: page.isActive,
    autopostEnabled: page.autopostEnabled,
    connectMode: page.connectMode,
    connectionId: page.connectionId,
    canReadInsights: insightsMeta?.canReadInsights ?? null,
    publishedPostCount: insightsMeta?.publishedPostCount,
    createdById: page.createdById,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}
