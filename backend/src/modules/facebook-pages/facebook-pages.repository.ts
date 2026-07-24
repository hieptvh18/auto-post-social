import { Injectable } from '@nestjs/common';
import type { FacebookPage } from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface CreateFacebookPageData {
  pageName: string;
  pageId: string;
  accessTokenEnc: string;
  tokenExpireAt?: Date;
  createdById: string;
}

export interface UpdateFacebookPageData {
  pageName?: string;
  accessTokenEnc?: string;
  tokenExpireAt?: Date | null;
  autopostEnabled?: boolean;
  isActive?: boolean;
}

/** Nơi duy nhất viết Prisma query cho bảng facebook_pages (rule 01). */
@Injectable()
export class FacebookPagesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(): Promise<FacebookPage[]> {
    return this.prisma.facebookPage.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(id: string): Promise<FacebookPage | null> {
    return this.prisma.facebookPage.findUnique({ where: { id } });
  }

  findByPageId(pageId: string): Promise<FacebookPage | null> {
    return this.prisma.facebookPage.findUnique({ where: { pageId } });
  }

  create(data: CreateFacebookPageData): Promise<FacebookPage> {
    return this.prisma.facebookPage.create({
      data: {
        pageName: data.pageName,
        pageId: data.pageId,
        accessTokenEnc: data.accessTokenEnc,
        tokenExpireAt: data.tokenExpireAt,
        createdById: data.createdById,
      },
    });
  }

  update(id: string, data: UpdateFacebookPageData): Promise<FacebookPage> {
    return this.prisma.facebookPage.update({ where: { id }, data });
  }
}
