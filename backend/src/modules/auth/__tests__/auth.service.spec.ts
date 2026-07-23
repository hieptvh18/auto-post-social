import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import type { User } from '../../../../generated/prisma/client';
import { UserRole } from '../../../../generated/prisma/client';
import type { AppConfigService } from '../../../config/app-config.service';
import type { UsersRepository } from '../../users/users.repository';
import { AuthService } from '../auth.service';

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  name: 'System Admin',
  email: 'admin@company.local',
  passwordHash: 'hashed',
  role: UserRole.ADMIN,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

describe('AuthService', () => {
  let usersRepository: { findByEmail: jest.Mock; findById: jest.Mock };
  let passwordService: { compare: jest.Mock; hash: jest.Mock };
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let config: AppConfigService;
  let service: AuthService;

  beforeEach(() => {
    usersRepository = { findByEmail: jest.fn(), findById: jest.fn() };
    passwordService = { compare: jest.fn(), hash: jest.fn() };
    jwtService = {
      signAsync: jest
        .fn()
        .mockImplementation((_p: unknown, opts: { secret: string }) =>
          Promise.resolve(
            opts.secret === 'access-secret' ? 'access.jwt' : 'refresh.jwt',
          ),
        ),
      verifyAsync: jest.fn(),
    };
    config = {
      jwt: {
        accessSecret: 'access-secret',
        refreshSecret: 'refresh-secret',
        accessExpires: '15m',
        refreshExpires: '7d',
      },
    } as unknown as AppConfigService;

    service = new AuthService(
      usersRepository as unknown as UsersRepository,
      passwordService,
      jwtService as unknown as JwtService,
      config,
    );
  });

  describe('validateUser', () => {
    it('trả về user khi email và mật khẩu đúng', async () => {
      const user = makeUser();
      usersRepository.findByEmail.mockResolvedValue(user);
      passwordService.compare.mockResolvedValue(true);

      await expect(
        service.validateUser('admin@company.local', 'secret'),
      ).resolves.toBe(user);
    });

    it('ném 401 khi email không tồn tại', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);

      await expect(service.validateUser('x@y.local', 'secret')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('ném 401 khi sai mật khẩu', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());
      passwordService.compare.mockResolvedValue(false);

      await expect(
        service.validateUser('admin@company.local', 'sai'),
      ).rejects.toThrow('Email hoặc mật khẩu không đúng');
    });

    it('không tiết lộ email nào tồn tại — cùng message cho 2 trường hợp sai', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      const notFound = await service
        .validateUser('x@y.local', 'p')
        .catch((e: Error) => e.message);

      usersRepository.findByEmail.mockResolvedValue(makeUser());
      passwordService.compare.mockResolvedValue(false);
      const wrongPass = await service
        .validateUser('admin@company.local', 'p')
        .catch((e: Error) => e.message);

      expect(notFound).toBe(wrongPass);
    });

    it('ném 401 khi user đã bị vô hiệu hóa', async () => {
      usersRepository.findByEmail.mockResolvedValue(
        makeUser({ isActive: false }),
      );
      passwordService.compare.mockResolvedValue(true);

      await expect(
        service.validateUser('admin@company.local', 'secret'),
      ).rejects.toThrow('Tài khoản đã bị vô hiệu hóa');
    });
  });

  describe('login', () => {
    it('trả cặp token, expiresIn theo giây và user không kèm passwordHash', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());
      passwordService.compare.mockResolvedValue(true);

      const result = await service.login({
        email: 'admin@company.local',
        password: 'secret',
      });

      expect(result).toEqual({
        accessToken: 'access.jwt',
        refreshToken: 'refresh.jwt',
        expiresIn: 900,
        user: {
          id: 'u1',
          email: 'admin@company.local',
          name: 'System Admin',
          role: UserRole.ADMIN,
        },
      });
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('ký access và refresh bằng 2 secret khác nhau', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());
      passwordService.compare.mockResolvedValue(true);

      await service.login({ email: 'admin@company.local', password: 'secret' });

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sub: 'u1', email: 'admin@company.local', role: UserRole.ADMIN },
        { secret: 'access-secret', expiresIn: 900 },
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { sub: 'u1', email: 'admin@company.local', role: UserRole.ADMIN },
        { secret: 'refresh-secret', expiresIn: 604800 },
      );
    });
  });

  describe('refresh', () => {
    it('cấp lại cặp token khi refresh token hợp lệ', async () => {
      jwtService.verifyAsync.mockResolvedValue({
        sub: 'u1',
        email: 'admin@company.local',
        role: UserRole.ADMIN,
      });
      usersRepository.findById.mockResolvedValue(makeUser());

      await expect(service.refresh('refresh.jwt')).resolves.toEqual({
        accessToken: 'access.jwt',
        refreshToken: 'refresh.jwt',
        expiresIn: 900,
      });
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('refresh.jwt', {
        secret: 'refresh-secret',
      });
    });

    it('ném 401 khi refresh token hết hạn/hỏng', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(service.refresh('hong')).rejects.toThrow(
        'Token không hợp lệ hoặc đã hết hạn',
      );
    });

    it('ném 401 khi user trong token đã bị xóa', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u404' });
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.refresh('refresh.jwt')).rejects.toThrow(
        'Tài khoản không còn hiệu lực',
      );
    });

    it('ném 401 khi user đã bị vô hiệu hóa sau khi token được cấp', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1' });
      usersRepository.findById.mockResolvedValue(makeUser({ isActive: false }));

      await expect(service.refresh('refresh.jwt')).rejects.toThrow(
        'Tài khoản không còn hiệu lực',
      );
    });
  });

  describe('authenticate', () => {
    it('verify bằng access secret và trả user hiện tại từ DB', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1' });
      usersRepository.findById.mockResolvedValue(
        makeUser({ role: UserRole.EDITOR }),
      );

      await expect(service.authenticate('access.jwt')).resolves.toEqual({
        id: 'u1',
        email: 'admin@company.local',
        name: 'System Admin',
        role: UserRole.EDITOR,
      });
      expect(jwtService.verifyAsync).toHaveBeenCalledWith('access.jwt', {
        secret: 'access-secret',
      });
    });

    it('ném 401 khi access token không hợp lệ', async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error('invalid signature'));

      await expect(service.authenticate('hong')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('ném 401 với token cũ của user vừa bị khóa', async () => {
      jwtService.verifyAsync.mockResolvedValue({ sub: 'u1' });
      usersRepository.findById.mockResolvedValue(makeUser({ isActive: false }));

      await expect(service.authenticate('access.jwt')).rejects.toThrow(
        'Tài khoản không còn hiệu lực',
      );
    });
  });

  describe('me', () => {
    it('trả thông tin user hiện tại, không kèm passwordHash', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());

      const result = await service.me('u1');

      expect(result).toEqual({
        id: 'u1',
        email: 'admin@company.local',
        name: 'System Admin',
        role: UserRole.ADMIN,
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('ném 401 khi user không còn tồn tại', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(service.me('u404')).rejects.toThrow(UnauthorizedException);
    });
  });
});
