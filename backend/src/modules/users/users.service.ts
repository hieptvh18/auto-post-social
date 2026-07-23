import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { User } from '../../../generated/prisma/client';
import { UserRole } from '../../../generated/prisma/client';
import { PasswordService } from '../../infra/crypto/password.service';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { QueryUsersDto } from './dto/query-users.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import { toUserResponse, type UserResponse } from './user.mapper';
import { UsersRepository, type UpdateUserData } from './users.repository';

export interface PaginatedUsers {
  data: UserResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
  ) {}

  async findAll(query: QueryUsersDto): Promise<PaginatedUsers> {
    const { data, total } = await this.repository.findMany({
      role: query.role,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: data.map(toUserResponse),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(id: string): Promise<UserResponse> {
    return toUserResponse(await this.getOrFail(id));
  }

  async create(dto: CreateUserDto, actorId: string): Promise<UserResponse> {
    const existing = await this.repository.findByEmail(dto.email);
    if (existing !== null) {
      throw new ConflictException('Email đã tồn tại');
    }

    const created = await this.repository.create({
      name: dto.name,
      email: dto.email,
      passwordHash: await this.passwordService.hash(dto.password),
      role: dto.role,
    });

    await this.auditService.log({
      userId: actorId,
      action: AuditAction.USER_CREATE,
      resource: `user:${created.id}`,
      afterValue: { email: created.email, role: created.role },
    });

    return toUserResponse(created);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
  ): Promise<UserResponse> {
    const current = await this.getOrFail(id);

    if (dto.email !== undefined && dto.email !== current.email) {
      const existing = await this.repository.findByEmail(dto.email);
      if (existing !== null) {
        throw new ConflictException('Email đã tồn tại');
      }
    }

    if (dto.isActive === false || dto.role !== undefined) {
      await this.assertNotSelfLockout(current, actorId, dto);
      await this.assertNotLastAdmin(current, dto);
    }

    const data: UpdateUserData = {
      name: dto.name,
      email: dto.email,
      role: dto.role,
      isActive: dto.isActive,
    };
    if (dto.password !== undefined) {
      data.passwordHash = await this.passwordService.hash(dto.password);
    }

    const updated = await this.repository.update(id, data);

    await this.auditService.log({
      userId: actorId,
      action: AuditAction.USER_UPDATE,
      resource: `user:${id}`,
      beforeValue: {
        email: current.email,
        role: current.role,
        isActive: current.isActive,
      },
      afterValue: {
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
      },
    });

    return toUserResponse(updated);
  }

  /** Soft delete: isActive = false, không xóa dòng (còn FK từ content/audit). */
  async remove(id: string, actorId: string): Promise<UserResponse> {
    const current = await this.getOrFail(id);

    if (id === actorId) {
      throw new BadRequestException(
        'Không thể tự vô hiệu hóa tài khoản của mình',
      );
    }
    await this.assertNotLastAdmin(current, { isActive: false });

    const updated = await this.repository.update(id, { isActive: false });

    await this.auditService.log({
      userId: actorId,
      action: AuditAction.USER_DELETE,
      resource: `user:${id}`,
      beforeValue: { isActive: current.isActive },
      afterValue: { isActive: false },
    });

    return toUserResponse(updated);
  }

  private async getOrFail(id: string): Promise<User> {
    const user = await this.repository.findById(id);
    if (user === null) {
      throw new NotFoundException('Không tìm thấy người dùng');
    }
    return user;
  }

  /** Admin không được tự khóa hoặc tự hạ quyền chính mình. */
  private assertNotSelfLockout(
    current: User,
    actorId: string,
    dto: UpdateUserDto,
  ): Promise<void> {
    if (current.id !== actorId) return Promise.resolve();
    if (dto.isActive === false) {
      throw new BadRequestException(
        'Không thể tự vô hiệu hóa tài khoản của mình',
      );
    }
    if (dto.role !== undefined && dto.role !== current.role) {
      throw new BadRequestException('Không thể tự đổi quyền của chính mình');
    }
    return Promise.resolve();
  }

  /** Hệ thống luôn phải còn ít nhất 1 ADMIN đang hoạt động. */
  private async assertNotLastAdmin(
    current: User,
    change: { role?: UserRole; isActive?: boolean },
  ): Promise<void> {
    const isCurrentlyActiveAdmin =
      current.role === UserRole.ADMIN && current.isActive;
    if (!isCurrentlyActiveAdmin) return;

    const losesAdmin =
      change.isActive === false ||
      (change.role !== undefined && change.role !== UserRole.ADMIN);
    if (!losesAdmin) return;

    const activeAdmins = await this.repository.countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new BadRequestException(
        'Không thể vô hiệu hóa hoặc hạ quyền admin cuối cùng',
      );
    }
  }
}
