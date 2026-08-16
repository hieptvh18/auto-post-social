import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { User } from '../../../../generated/prisma/client';
import { UserRole } from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { AuditAction, type AuditService } from '../../audit/audit.service';
import type { UsersRepository } from '../users.repository';
import { UsersService } from '../users.service';

/**
 * Plan 26: service nhận cả `AuthenticatedUser` (không chỉ id) vì luật
 * "chỉ SUPER_ADMIN đụng được role SUPER_ADMIN" cần biết role người thao tác.
 * Giữ nguyên id 'admin-1' để các test cũ không phải sửa gì khác.
 */
const ACTOR: AuthenticatedUser = {
  id: 'admin-1',
  name: 'System Admin',
  email: 'admin@company.local',
  role: UserRole.ADMIN,
};

const SUPER_ACTOR: AuthenticatedUser = {
  id: 'super-1',
  name: 'Super Admin',
  email: 'super@company.local',
  role: UserRole.SUPER_ADMIN,
};

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  name: 'Nguyen Van A',
  email: 'a@company.local',
  passwordHash: 'hashed',
  role: UserRole.CONTENT,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  ...overrides,
});

describe('UsersService', () => {
  let repository: {
    findMany: jest.Mock;
    findById: jest.Mock;
    findByEmail: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    countActiveAdmins: jest.Mock;
    countActiveSuperAdmins: jest.Mock;
  };
  let passwordService: { hash: jest.Mock; compare: jest.Mock };
  let auditService: { log: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    repository = {
      findMany: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      countActiveAdmins: jest.fn(),
      countActiveSuperAdmins: jest.fn(),
    };
    passwordService = {
      hash: jest.fn().mockResolvedValue('new-hash'),
      compare: jest.fn(),
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    service = new UsersService(
      repository as unknown as UsersRepository,
      passwordService,
      auditService as unknown as AuditService,
    );
  });

  describe('findAll', () => {
    it('trả data đã map và meta phân trang', async () => {
      repository.findMany.mockResolvedValue({
        data: [makeUser()],
        total: 3,
      });

      const result = await service.findAll({ page: 2, limit: 2 });

      expect(result.meta).toEqual({
        page: 2,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).not.toHaveProperty('passwordHash');
    });

    it('truyền filter role và search xuống repository', async () => {
      repository.findMany.mockResolvedValue({ data: [], total: 0 });

      await service.findAll({
        page: 1,
        limit: 20,
        role: UserRole.EDITOR,
        search: 'nguyen',
      });

      expect(repository.findMany).toHaveBeenCalledWith({
        role: UserRole.EDITOR,
        search: 'nguyen',
        page: 1,
        limit: 20,
      });
    });
  });

  describe('findOne', () => {
    it('trả user không kèm passwordHash', async () => {
      repository.findById.mockResolvedValue(makeUser());

      const result = await service.findOne('u1');

      expect(result.id).toBe('u1');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('ném NotFoundException khi không tồn tại', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.findOne('u404')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto = {
      name: 'Nguyen Van A',
      email: 'a@company.local',
      password: 'TempPass123!',
      role: UserRole.CONTENT,
    };

    it('băm mật khẩu, tạo user và ghi audit USER_CREATE', async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockResolvedValue(makeUser());

      const result = await service.create(dto, ACTOR);

      expect(passwordService.hash).toHaveBeenCalledWith('TempPass123!');
      expect(repository.create).toHaveBeenCalledWith({
        name: dto.name,
        email: dto.email,
        passwordHash: 'new-hash',
        role: UserRole.CONTENT,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ACTOR.id,
          action: AuditAction.USER_CREATE,
          resource: 'user:u1',
        }),
      );
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('ném ConflictException khi email đã tồn tại', async () => {
      repository.findByEmail.mockResolvedValue(makeUser());

      await expect(service.create(dto, ACTOR)).rejects.toThrow(
        ConflictException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('cập nhật tên và ghi audit USER_UPDATE', async () => {
      const current = makeUser();
      repository.findById.mockResolvedValue(current);
      repository.update.mockResolvedValue(makeUser({ name: 'Tên mới' }));

      const result = await service.update('u1', { name: 'Tên mới' }, ACTOR);

      expect(repository.update).toHaveBeenCalledWith('u1', {
        name: 'Tên mới',
        email: undefined,
        role: undefined,
        isActive: undefined,
      });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.USER_UPDATE }),
      );
      expect(result.name).toBe('Tên mới');
    });

    it('ném NotFoundException khi user không tồn tại', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.update('u404', { name: 'x' }, ACTOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('băm lại mật khẩu khi dto có password', async () => {
      repository.findById.mockResolvedValue(makeUser());
      repository.update.mockResolvedValue(makeUser());

      await service.update('u1', { password: 'NewPass123!' }, ACTOR);

      expect(passwordService.hash).toHaveBeenCalledWith('NewPass123!');
      expect(repository.update).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ passwordHash: 'new-hash' }),
      );
    });

    it('ném ConflictException khi đổi sang email người khác đang dùng', async () => {
      repository.findById.mockResolvedValue(makeUser());
      repository.findByEmail.mockResolvedValue(makeUser({ id: 'u2' }));

      await expect(
        service.update('u1', { email: 'b@company.local' }, ACTOR),
      ).rejects.toThrow(ConflictException);
    });

    it('cho phép gửi lại chính email hiện tại mà không báo trùng', async () => {
      const current = makeUser();
      repository.findById.mockResolvedValue(current);
      repository.update.mockResolvedValue(current);

      await service.update('u1', { email: current.email }, ACTOR);

      expect(repository.findByEmail).not.toHaveBeenCalled();
      expect(repository.update).toHaveBeenCalled();
    });

    it('cho phép đổi email khi email mới chưa ai dùng', async () => {
      repository.findById.mockResolvedValue(makeUser());
      repository.findByEmail.mockResolvedValue(null);
      repository.update.mockResolvedValue(
        makeUser({ email: 'b@company.local' }),
      );

      const result = await service.update(
        'u1',
        { email: 'b@company.local' },
        ACTOR,
      );

      expect(result.email).toBe('b@company.local');
    });

    it('chặn admin tự vô hiệu hóa chính mình', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: ACTOR.id, role: UserRole.ADMIN }),
      );

      await expect(
        service.update(ACTOR.id, { isActive: false }, ACTOR),
      ).rejects.toThrow('Không thể tự vô hiệu hóa tài khoản của mình');
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('chặn admin tự hạ quyền chính mình', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: ACTOR.id, role: UserRole.ADMIN }),
      );

      await expect(
        service.update(ACTOR.id, { role: UserRole.EDITOR }, ACTOR),
      ).rejects.toThrow('Không thể tự đổi quyền của chính mình');
    });

    it('cho phép tự gửi lại đúng role hiện tại (no-op)', async () => {
      const current = makeUser({ id: ACTOR.id, role: UserRole.ADMIN });
      repository.findById.mockResolvedValue(current);
      repository.countActiveAdmins.mockResolvedValue(2);
      repository.update.mockResolvedValue(current);

      await expect(
        service.update(ACTOR.id, { role: UserRole.ADMIN }, ACTOR),
      ).resolves.toBeDefined();
    });

    it('chặn hạ quyền admin cuối cùng', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN }),
      );
      repository.countActiveAdmins.mockResolvedValue(1);

      await expect(
        service.update('u1', { role: UserRole.EDITOR }, ACTOR),
      ).rejects.toThrow('Không thể vô hiệu hóa hoặc hạ quyền admin cuối cùng');
    });

    it('chặn vô hiệu hóa admin cuối cùng', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN }),
      );
      repository.countActiveAdmins.mockResolvedValue(1);

      await expect(
        service.update('u1', { isActive: false }, ACTOR),
      ).rejects.toThrow('Không thể vô hiệu hóa hoặc hạ quyền admin cuối cùng');
    });

    it('cho phép hạ quyền admin khi còn admin khác', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN }),
      );
      repository.countActiveAdmins.mockResolvedValue(2);
      repository.update.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.EDITOR }),
      );

      const result = await service.update(
        'u1',
        { role: UserRole.EDITOR },
        ACTOR,
      );

      expect(result.role).toBe(UserRole.EDITOR);
    });

    it('không đếm admin khi user đang sửa không phải admin đang hoạt động', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.CONTENT }),
      );
      repository.update.mockResolvedValue(
        makeUser({ id: 'u1', isActive: false }),
      );

      await service.update('u1', { isActive: false }, ACTOR);

      expect(repository.countActiveAdmins).not.toHaveBeenCalled();
    });

    it('không chặn khi nâng quyền user thường lên ADMIN', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.CONTENT }),
      );
      repository.update.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN }),
      );

      const result = await service.update(
        'u1',
        { role: UserRole.ADMIN },
        ACTOR,
      );

      expect(result.role).toBe(UserRole.ADMIN);
    });

    it('không kiểm tra admin cuối khi admin đang bị khóa sẵn', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN, isActive: false }),
      );
      repository.update.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.EDITOR, isActive: false }),
      );

      await service.update('u1', { role: UserRole.EDITOR }, ACTOR);

      expect(repository.countActiveAdmins).not.toHaveBeenCalled();
    });

    it('bật lại isActive=true không kích hoạt kiểm tra admin cuối', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN, isActive: false }),
      );
      repository.update.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN, isActive: true }),
      );

      await service.update('u1', { isActive: true }, ACTOR);

      expect(repository.countActiveAdmins).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft delete: đặt isActive=false và ghi audit USER_DELETE', async () => {
      repository.findById.mockResolvedValue(makeUser());
      repository.update.mockResolvedValue(makeUser({ isActive: false }));

      const result = await service.remove('u1', ACTOR);

      expect(repository.update).toHaveBeenCalledWith('u1', { isActive: false });
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.USER_DELETE }),
      );
      expect(result.isActive).toBe(false);
    });

    it('ném NotFoundException khi user không tồn tại', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.remove('u404', ACTOR)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('chặn admin tự xóa chính mình', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: ACTOR.id, role: UserRole.ADMIN }),
      );

      await expect(service.remove(ACTOR.id, ACTOR)).rejects.toThrow(
        BadRequestException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('chặn xóa admin cuối cùng', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN }),
      );
      repository.countActiveAdmins.mockResolvedValue(1);

      await expect(service.remove('u1', ACTOR)).rejects.toThrow(
        'Không thể vô hiệu hóa hoặc hạ quyền admin cuối cùng',
      );
    });

    it('cho phép xóa admin khi còn admin khác', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN }),
      );
      repository.countActiveAdmins.mockResolvedValue(2);
      repository.update.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN, isActive: false }),
      );

      await expect(service.remove('u1', ACTOR)).resolves.toMatchObject({
        isActive: false,
      });
    });
  });

  /**
   * Plan 26 §3.4 — không có 2 luật này thì role SUPER_ADMIN chỉ là trang trí:
   * bất kỳ ADMIN nào cũng tự nâng mình lên, hoặc khoá hết SUPER_ADMIN đi.
   */
  describe('phân quyền SUPER_ADMIN (plan 26 §3.4)', () => {
    const superAdminDto = {
      name: 'Super',
      email: 'super@company.local',
      password: 'TempPass123!',
      role: UserRole.SUPER_ADMIN,
    };

    it('ADMIN tạo user role SUPER_ADMIN ⇒ 403', async () => {
      await expect(service.create(superAdminDto, ACTOR)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('SUPER_ADMIN tạo user role SUPER_ADMIN ⇒ thành công', async () => {
      repository.findByEmail.mockResolvedValue(null);
      repository.create.mockResolvedValue(
        makeUser({ role: UserRole.SUPER_ADMIN }),
      );

      await expect(
        service.create(superAdminDto, SUPER_ACTOR),
      ).resolves.toMatchObject({ role: UserRole.SUPER_ADMIN });
    });

    it('ADMIN nâng user thường lên SUPER_ADMIN ⇒ 403', async () => {
      repository.findById.mockResolvedValue(makeUser());

      await expect(
        service.update('u1', { role: UserRole.SUPER_ADMIN }, ACTOR),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('ADMIN hạ quyền một SUPER_ADMIN sẵn có ⇒ 403', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.SUPER_ADMIN }),
      );

      await expect(
        service.update('u1', { role: UserRole.ADMIN }, ACTOR),
      ).rejects.toThrow(ForbiddenException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('ADMIN vô hiệu hoá một SUPER_ADMIN ⇒ 403', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.SUPER_ADMIN }),
      );

      await expect(service.remove('u1', ACTOR)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('hạ role SUPER_ADMIN CUỐI CÙNG ⇒ 422', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.SUPER_ADMIN }),
      );
      repository.countActiveAdmins.mockResolvedValue(5);
      repository.countActiveSuperAdmins.mockResolvedValue(1);

      await expect(
        service.update('u1', { role: UserRole.ADMIN }, SUPER_ACTOR),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('vô hiệu hoá SUPER_ADMIN cuối cùng ⇒ 422', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.SUPER_ADMIN }),
      );
      repository.countActiveAdmins.mockResolvedValue(5);
      repository.countActiveSuperAdmins.mockResolvedValue(1);

      await expect(service.remove('u1', SUPER_ACTOR)).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('hạ SUPER_ADMIN khi còn người khác ⇒ cho phép', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.SUPER_ADMIN }),
      );
      repository.countActiveAdmins.mockResolvedValue(5);
      repository.countActiveSuperAdmins.mockResolvedValue(2);
      repository.update.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN }),
      );

      await expect(
        service.update('u1', { role: UserRole.ADMIN }, SUPER_ACTOR),
      ).resolves.toMatchObject({ role: UserRole.ADMIN });
    });

    it('SUPER_ADMIN đang hoạt động ⇒ hạ ADMIN cuối cùng KHÔNG bị chặn', async () => {
      repository.findById.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.ADMIN }),
      );
      // countActiveAdmins đếm cả SUPER_ADMIN ⇒ vẫn còn 2 người quản trị.
      repository.countActiveAdmins.mockResolvedValue(2);
      repository.update.mockResolvedValue(
        makeUser({ id: 'u1', role: UserRole.EDITOR }),
      );

      await expect(
        service.update('u1', { role: UserRole.EDITOR }, SUPER_ACTOR),
      ).resolves.toMatchObject({ role: UserRole.EDITOR });
    });
  });
});
