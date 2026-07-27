import { Injectable } from '@nestjs/common';
import type { FacebookConnection } from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface UpsertConnectionData {
  fbUserId: string;
  fbUserName: string | null;
  userTokenEnc: string;
  tokenExpireAt: Date | null;
  scopes: string[];
  connectedById: string;
}

/** Kèm số page đang dùng token của kết nối này — UI cần hiện ngay ở bảng. */
export interface ConnectionWithPageCount extends FacebookConnection {
  pageCount: number;
}

/** Nơi duy nhất viết Prisma query cho bảng facebook_connections (rule 01). */
@Injectable()
export class FacebookConnectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(): Promise<ConnectionWithPageCount[]> {
    const rows = await this.prisma.facebookConnection.findMany({
      where: { revokedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { pages: true } } },
    });

    return rows.map(({ _count, ...connection }) => ({
      ...connection,
      pageCount: _count.pages,
    }));
  }

  findById(id: string): Promise<FacebookConnection | null> {
    return this.prisma.facebookConnection.findUnique({ where: { id } });
  }

  /**
   * Đăng nhập lại bằng cùng một tài khoản Facebook = **cập nhật** dòng cũ, không đẻ
   * dòng mới (UNIQUE `fb_user_id`). Nhờ vậy các page đang trỏ vào kết nối này tự
   * động dùng token mới mà không phải gán lại.
   */
  upsertByFbUserId(data: UpsertConnectionData): Promise<FacebookConnection> {
    return this.prisma.facebookConnection.upsert({
      where: { fbUserId: data.fbUserId },
      create: {
        fbUserId: data.fbUserId,
        fbUserName: data.fbUserName,
        userTokenEnc: data.userTokenEnc,
        tokenExpireAt: data.tokenExpireAt,
        scopes: data.scopes,
        connectedById: data.connectedById,
      },
      update: {
        fbUserName: data.fbUserName,
        userTokenEnc: data.userTokenEnc,
        tokenExpireAt: data.tokenExpireAt,
        scopes: data.scopes,
        connectedById: data.connectedById,
        revokedAt: null,
      },
    });
  }

  /** Ngắt kết nối: bỏ hẳn token đã lưu, giữ lại dòng để còn dấu vết. */
  revoke(id: string): Promise<FacebookConnection> {
    return this.prisma.facebookConnection.update({
      where: { id },
      data: { revokedAt: new Date(), userTokenEnc: null },
    });
  }
}
