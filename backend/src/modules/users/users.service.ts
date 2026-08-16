import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { User } from '../../../generated/prisma/client';
import { UserRole } from '../../../generated/prisma/client';
import { isAdminLevel } from '../../common/permissions';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
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

  async create(
    dto: CreateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    this.assertMaySetSuperAdmin(dto.role, actor);

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
      userId: actor.id,
      action: AuditAction.USER_CREATE,
      resource: `user:${created.id}`,
      afterValue: { email: created.email, role: created.role },
    });

    return toUserResponse(created);
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserResponse> {
    const current = await this.getOrFail(id);

    // Cả role ĐÍCH lẫn role HIỆN TẠI đều phải kiểm: ADMIN không được nâng ai lên
    // SUPER_ADMIN, và cũng không được sửa (kể cả hạ quyền) một SUPER_ADMIN sẵn có.
    this.assertMaySetSuperAdmin(dto.role, actor);
    this.assertMaySetSuperAdmin(current.role, actor);

    if (dto.email !== undefined && dto.email !== current.email) {
      const existing = await this.repository.findByEmail(dto.email);
      if (existing !== null) {
        throw new ConflictException('Email đã tồn tại');
      }
    }

    if (dto.isActive === false || dto.role !== undefined) {
      await this.assertNotSelfLockout(current, actor.id, dto);
      await this.assertNotLastAdmin(current, dto);
      await this.assertNotLastSuperAdmin(current, dto);
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
      userId: actor.id,
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
  async remove(id: string, actor: AuthenticatedUser): Promise<UserResponse> {
    const current = await this.getOrFail(id);

    // ADMIN không được vô hiệu hoá một SUPER_ADMIN — nếu không thì luật "ADMIN
    // không tạo được SUPER_ADMIN" ở trên vô nghĩa: khoá hết là xong.
    this.assertMaySetSuperAdmin(current.role, actor);

    if (id === actor.id) {
      throw new BadRequestException(
        'Không thể tự vô hiệu hóa tài khoản của mình',
      );
    }
    await this.assertNotLastAdmin(current, { isActive: false });
    await this.assertNotLastSuperAdmin(current, { isActive: false });

    const updated = await this.repository.update(id, { isActive: false });

    await this.auditService.log({
      userId: actor.id,
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

  /**
   * Chỉ SUPER_ADMIN mới được đụng tới role SUPER_ADMIN (plan 26 §3.4).
   *
   * Không có luật này thì bất kỳ ADMIN nào cũng tự nâng mình lên SUPER_ADMIN và
   * cả plan 26 chỉ còn là trang trí.
   */
  private assertMaySetSuperAdmin(
    role: UserRole | undefined,
    actor: AuthenticatedUser,
  ): void {
    if (role !== UserRole.SUPER_ADMIN) return;
    if (actor.role === UserRole.SUPER_ADMIN) return;
    throw new ForbiddenException(
      'Chỉ Quản trị cấp cao mới thao tác được với tài khoản Quản trị cấp cao',
    );
  }

  /**
   * Hệ thống luôn phải còn ít nhất 1 SUPER_ADMIN đang hoạt động (plan 26 §3.4).
   *
   * Hạ/khoá người cuối cùng ⇒ **không ai** vào được menu Reup nữa, và ADMIN
   * không tự tạo lại được (luật `assertMaySetSuperAdmin`) ⇒ khoá chết thật sự.
   */
  private async assertNotLastSuperAdmin(
    current: User,
    change: { role?: UserRole; isActive?: boolean },
  ): Promise<void> {
    if (current.role !== UserRole.SUPER_ADMIN || !current.isActive) return;

    const losesSuperAdmin =
      change.isActive === false ||
      (change.role !== undefined && change.role !== UserRole.SUPER_ADMIN);
    if (!losesSuperAdmin) return;

    const remaining = await this.repository.countActiveSuperAdmins();
    if (remaining <= 1) {
      throw new UnprocessableEntityException(
        'Không thể hạ quyền hoặc vô hiệu hóa Quản trị cấp cao cuối cùng',
      );
    }
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

  /**
   * Hệ thống luôn phải còn ít nhất 1 người quản trị đang hoạt động.
   *
   * Plan 26: "quản trị" = ADMIN **hoặc** SUPER_ADMIN — `countActiveAdmins()`
   * đếm cả hai. Hạ ADMIN cuối cùng trong khi vẫn còn một SUPER_ADMIN hoạt động
   * là hợp lệ, không khoá chết hệ thống.
   */
  private async assertNotLastAdmin(
    current: User,
    change: { role?: UserRole; isActive?: boolean },
  ): Promise<void> {
    const isCurrentlyActiveAdmin =
      isAdminLevel(current.role) && current.isActive;
    if (!isCurrentlyActiveAdmin) return;

    const losesAdmin =
      change.isActive === false ||
      (change.role !== undefined && !isAdminLevel(change.role));
    if (!losesAdmin) return;

    const activeAdmins = await this.repository.countActiveAdmins();
    if (activeAdmins <= 1) {
      throw new BadRequestException(
        'Không thể vô hiệu hóa hoặc hạ quyền admin cuối cùng',
      );
    }
  }
}
