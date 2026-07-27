import type { ConnectionWithPageCount } from './facebook-connections.repository';

/**
 * Bản trả ra API của một kết nối Facebook.
 * KHÔNG có field nào chứa token — `userTokenEnc` không bao giờ rời khỏi service.
 */
export interface FacebookConnectionResponse {
  id: string;
  fbUserId: string;
  fbUserName: string | null;
  /** null = user token không hết hạn. */
  tokenExpireAt: Date | null;
  /** null khi không có hạn; âm nghĩa là đã hết hạn. */
  daysUntilExpire: number | null;
  scopes: string[];
  pageCount: number;
  connectedById: string;
  createdAt: Date;
  updatedAt: Date;
}

const MS_PER_DAY = 86_400_000;

export function toFacebookConnectionResponse(
  connection: ConnectionWithPageCount,
  now: Date,
): FacebookConnectionResponse {
  return {
    id: connection.id,
    fbUserId: connection.fbUserId,
    fbUserName: connection.fbUserName,
    tokenExpireAt: connection.tokenExpireAt,
    daysUntilExpire:
      connection.tokenExpireAt === null
        ? null
        : Math.floor(
            (connection.tokenExpireAt.getTime() - now.getTime()) / MS_PER_DAY,
          ),
    scopes: connection.scopes,
    pageCount: connection.pageCount,
    connectedById: connection.connectedById,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}
