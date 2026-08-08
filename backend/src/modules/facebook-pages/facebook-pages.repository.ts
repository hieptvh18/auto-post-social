import { Injectable } from '@nestjs/common';
import type {
  FacebookConnectMode,
  FacebookPage,
} from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CreateFacebookPageData {
  pageName: string;
  pageId: string;
  accessTokenEnc: string;
  tokenExpireAt?: Date;
  createdById: string;
  connectMode?: FacebookConnectMode;
  connectionId?: string | null;
}

export interface UpdateFacebookPageData {
  pageName?: string;
  accessTokenEnc?: string;
  tokenExpireAt?: Date | null;
  autopostEnabled?: boolean;
  isActive?: boolean;
  deletedAt?: Date | null;
  createdById?: string;
  connectMode?: FacebookConnectMode;
  connectionId?: string | null;
}

/**
 * Page + hai thông tin phục vụ màn thống kê (plan 25):
 * scope của kết nối (biết token có `read_insights` không) và số bài đã đăng.
 */
export interface PageWithInsightsMeta extends FacebookPage {
  connection: { scopes: string[]; revokedAt: Date | null } | null;
  _count: { assignments: number };
}

/** Nơi duy nhất viết Prisma query cho bảng facebook_pages (rule 01). */
@Injectable()
export class FacebookPagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Chỉ page chưa bị xoá. Page tạm dừng (`isActive=false`) vẫn trả về. */
  findMany(): Promise<FacebookPage[]> {
    return this.prisma.facebookPage.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Như `findMany()` nhưng kèm scope của kết nối và số bài đã đăng — hai thứ màn
   * Quản lý Page cần cho cột "Bài đã đăng" và cảnh báo thiếu `read_insights`
   * (plan 25). Tách khỏi `findMany()` để các nơi khác không phải trả giá join.
   */
  findManyWithInsightsMeta(): Promise<PageWithInsightsMeta[]> {
    return this.prisma.facebookPage.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        connection: { select: { scopes: true, revokedAt: true } },
        _count: {
          select: {
            assignments: {
              where: {
                publishedAt: { not: null },
                facebookPostId: { not: null },
              },
            },
          },
        },
      },
    });
  }

  /** Page đã xoá coi như không tồn tại ⇒ service trả 404. */
  findById(id: string): Promise<FacebookPage | null> {
    return this.prisma.facebookPage.findFirst({
      where: { id, deletedAt: null },
    });
  }

  /**
   * Cố tình **kể cả** page đã xoá: UNIQUE `page_id` áp trên cả dòng đã xoá mềm,
   * nên service cần thấy dòng cũ để hồi sinh thay vì tạo mới rồi vỡ constraint.
   */
  findByPageId(pageId: string): Promise<FacebookPage | null> {
    return this.prisma.facebookPage.findUnique({ where: { pageId } });
  }

  /**
   * Kể cả page đã xoá mềm — cùng lý do với `findByPageId`: màn chọn page cần biết
   * page nào đang tồn tại dưới dạng nào trước khi import.
   */
  findManyByPageIds(pageIds: string[]): Promise<FacebookPage[]> {
    return this.prisma.facebookPage.findMany({
      where: { pageId: { in: pageIds } },
    });
  }

  /** Các page đang dùng token của một kết nối (bỏ page đã xoá). */
  findByConnectionId(connectionId: string): Promise<FacebookPage[]> {
    return this.prisma.facebookPage.findMany({
      where: { connectionId, deletedAt: null },
    });
  }

  create(data: CreateFacebookPageData): Promise<FacebookPage> {
    return this.prisma.facebookPage.create({
      data: {
        pageName: data.pageName,
        pageId: data.pageId,
        accessTokenEnc: data.accessTokenEnc,
        tokenExpireAt: data.tokenExpireAt,
        createdById: data.createdById,
        connectMode: data.connectMode,
        connectionId: data.connectionId ?? null,
      },
    });
  }

  update(id: string, data: UpdateFacebookPageData): Promise<FacebookPage> {
    return this.prisma.facebookPage.update({ where: { id }, data });
  }
}
