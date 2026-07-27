/**
 * Thông tin page đọc được từ Meta Graph API khi test kết nối.
 *
 * KHÔNG hỏi field `tasks` ở đây: `tasks` chỉ tồn tại trên edge `/me/accounts`
 * (ngữ cảnh user token). Hỏi `tasks` trên page node bằng Page token ⇒ Graph trả
 * `(#100) nonexisting field` và hỏng cả lời gọi. Quyền đăng bài xác định qua
 * `scopes` của `/debug_token` thay vì `tasks`.
 */
export interface FacebookPageProbe {
  /** `id` do Graph trả về — phải khớp `pageId` đã gửi đi. */
  id: string;
  name: string | null;
  category: string | null;
}

/**
 * Loại access token. Chỉ token `PAGE` mới đăng bài được với tư cách page.
 * `SYSTEM_USER` là token của System User trong Business — phải đổi qua
 * `/me/accounts` để lấy Page token.
 */
export type FacebookTokenType =
  'PAGE' | 'USER' | 'SYSTEM_USER' | 'APP' | 'UNKNOWN';

/** Một page mà token hiện tại nhìn thấy (edge `/me/accounts`). */
export interface FacebookAccountPage {
  id: string;
  name: string | null;
}

/**
 * Page kèm **Page token** — chỉ edge `/me/accounts` trả về field `access_token`.
 * `tasks` là quyền thực tế của tài khoản trên page đó; có `CREATE_CONTENT` mới đăng bài được.
 */
export interface FacebookPageWithToken extends FacebookAccountPage {
  category: string | null;
  accessToken: string;
  tasks: string[];
}

/** Chủ sở hữu của một user token (`/me`). */
export interface FacebookUserProfile {
  id: string;
  name: string | null;
}

/** User token kèm hạn dùng. `expiresAt = null` nghĩa là không hết hạn. */
export interface FacebookUserToken {
  token: string;
  expiresAt: Date | null;
}

/** App credentials cần cho mọi lời gọi OAuth (đổi code, đổi token dài hạn). */
export interface FacebookAppCredentials {
  appId: string;
  appSecret: string;
}

/** Kết quả `/debug_token` — biết token là của ai, quyền gì, hạn tới bao giờ. */
export interface FacebookTokenInfo {
  type: FacebookTokenType;
  isValid: boolean;
  /** Với token loại PAGE: chính là ID của page sở hữu token. */
  profileId: string | null;
  scopes: string[];
  /** `null` = không bao giờ hết hạn (token System User) — thứ bot cần. */
  expiresAt: Date | null;
}

/** Cổng ra Meta Graph API (rule 01: external API luôn nằm sau interface trong infra/). */
export interface FacebookGraph {
  /** Đọc thông tin page bằng access token — dùng cho nút "Test kết nối". */
  getPage(pageId: string, accessToken: string): Promise<FacebookPageProbe>;
  /** Soi chính token đang dùng: loại, chủ sở hữu, scope, hạn dùng. */
  debugToken(accessToken: string): Promise<FacebookTokenInfo>;
  /**
   * Các page mà token USER/SYSTEM_USER nhìn thấy. Rỗng = tài khoản chưa được gán
   * Page nào trong Business settings — nguyên nhân thật sự đứng sau lỗi `(#10)`.
   */
  listPages(accessToken: string): Promise<FacebookAccountPage[]>;

  /**
   * Đổi `code` ở callback OAuth lấy user token **ngắn hạn** (1–2 giờ).
   * `redirectUri` phải trùng từng ký tự với URI đã dùng lúc mở dialog.
   */
  exchangeCodeForUserToken(
    code: string,
    redirectUri: string,
    app: FacebookAppCredentials,
  ): Promise<FacebookUserToken>;

  /**
   * Đổi user token ngắn hạn lấy bản **dài hạn (~60 ngày)**.
   * Bỏ bước này thì Page token lấy được cũng chỉ sống vài giờ — bot sẽ chết lặng.
   */
  exchangeLongLivedUserToken(
    shortLivedToken: string,
    app: FacebookAppCredentials,
  ): Promise<FacebookUserToken>;

  /** Chủ sở hữu của user token — để biết đã đăng nhập bằng tài khoản nào. */
  getMe(userToken: string, appSecret?: string): Promise<FacebookUserProfile>;

  /**
   * Như `listPages()` nhưng kèm Page token + `tasks`. Đây là nguồn Page token
   * vĩnh viễn khi `userToken` đã là bản dài hạn.
   */
  listPagesWithTokens(
    userToken: string,
    appSecret?: string,
  ): Promise<FacebookPageWithToken[]>;
}
