import { Injectable } from '@nestjs/common';
import type { Prisma, User, UserRole } from '../../../generated/prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';

export interface FindUsersFilter {
  role?: UserRole;
  search?: string;
  page: number;
  limit: number;
}

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
}

export interface UpdateUserData {
  name?: string;
  email?: string;
  passwordHash?: string;
  role?: UserRole;
  isActive?: boolean;
}

/** Nơi duy nhất viết Prisma query cho bảng users (rule 01). */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    filter: FindUsersFilter,
  ): Promise<{ data: User[]; total: number }> {
    const where: Prisma.UserWhereInput = {};
    if (filter.role !== undefined) where.role = filter.role;
    if (filter.search !== undefined && filter.search !== '') {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { email: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.limit,
        take: filter.limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Mọi user của một role, **kể cả đã vô hiệu hoá**, xếp người đang hoạt động lên
   * trước rồi tới tên. Nguồn cho các ô chọn người trên UI (vd ô "Editor" ở trang
   * Quản lý Ảnh/Video): form chỉ nhận người đang hoạt động, còn bộ lọc vẫn phải
   * liệt kê người đã nghỉ — nếu không thì bài cũ do họ dựng sẽ không lọc ra được.
   */
  findByRole(role: UserRole): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { role },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({ data });
  }

  update(id: string, data: UpdateUserData): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  /** Đếm admin còn hoạt động — chặn xóa/khóa admin cuối cùng. */
  countActiveAdmins(): Promise<number> {
    return this.prisma.user.count({
      where: { role: 'ADMIN', isActive: true },
    });
  }
}
