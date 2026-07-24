import type { FacebookPage } from '../../../generated/prisma/client';

export interface FacebookPageResponse {
  id: string;
  pageName: string;
  pageId: string;
  accessTokenMasked: string;
  tokenExpireAt: Date | null;
  isActive: boolean;
  autopostEnabled: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Không bao giờ nhận `accessTokenEnc` — chỉ nhận mask đã tính sẵn ở service. */
export function toFacebookPageResponse(
  page: FacebookPage,
  accessTokenMasked: string,
): FacebookPageResponse {
  return {
    id: page.id,
    pageName: page.pageName,
    pageId: page.pageId,
    accessTokenMasked,
    tokenExpireAt: page.tokenExpireAt,
    isActive: page.isActive,
    autopostEnabled: page.autopostEnabled,
    createdById: page.createdById,
    createdAt: page.createdAt,
    updatedAt: page.updatedAt,
  };
}
