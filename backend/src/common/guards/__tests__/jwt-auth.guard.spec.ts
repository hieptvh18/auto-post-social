import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UserRole } from '../../../../generated/prisma/client';
import type { AuthService } from '../../../modules/auth/auth.service';
import type { AuthenticatedUser } from '../../types/authenticated-user';
import { JwtAuthGuard } from '../jwt-auth.guard';

interface FakeRequest {
  headers: { authorization?: string };
  user?: AuthenticatedUser;
}

const makeContext = (request: FakeRequest): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const makeReflector = (isPublic?: boolean): Reflector =>
  ({ getAllAndOverride: () => isPublic }) as unknown as Reflector;

const authenticated: AuthenticatedUser = {
  id: 'u1',
  email: 'a@x.local',
  name: 'Admin',
  role: UserRole.ADMIN,
};

describe('JwtAuthGuard', () => {
  let authService: { authenticate: jest.Mock };

  beforeEach(() => {
    authService = { authenticate: jest.fn().mockResolvedValue(authenticated) };
  });

  const makeGuard = (isPublic?: boolean): JwtAuthGuard =>
    new JwtAuthGuard(
      makeReflector(isPublic),
      authService as unknown as AuthService,
    );

  describe('canActivate', () => {
    it('cho qua route @Public mà không cần token', async () => {
      const request: FakeRequest = { headers: {} };
      await expect(
        makeGuard(true).canActivate(makeContext(request)),
      ).resolves.toBe(true);
      expect(authService.authenticate).not.toHaveBeenCalled();
    });

    it('gắn request.user khi token hợp lệ', async () => {
      const request: FakeRequest = { headers: { authorization: 'Bearer abc' } };
      await expect(
        makeGuard(false).canActivate(makeContext(request)),
      ).resolves.toBe(true);
      expect(authService.authenticate).toHaveBeenCalledWith('abc');
      expect(request.user).toEqual(authenticated);
    });

    it('chấp nhận scheme "bearer" viết thường', async () => {
      const request: FakeRequest = { headers: { authorization: 'bearer abc' } };
      await expect(
        makeGuard(undefined).canActivate(makeContext(request)),
      ).resolves.toBe(true);
    });

    it('ném 401 khi thiếu header Authorization', async () => {
      const request: FakeRequest = { headers: {} };
      await expect(
        makeGuard(false).canActivate(makeContext(request)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('ném 401 khi scheme không phải Bearer', async () => {
      const request: FakeRequest = { headers: { authorization: 'Basic abc' } };
      await expect(
        makeGuard(false).canActivate(makeContext(request)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('ném 401 khi Bearer không kèm token', async () => {
      const request: FakeRequest = { headers: { authorization: 'Bearer' } };
      await expect(
        makeGuard(false).canActivate(makeContext(request)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('ném 401 khi token chỉ là khoảng trắng', async () => {
      const request: FakeRequest = { headers: { authorization: 'Bearer    ' } };
      await expect(
        makeGuard(false).canActivate(makeContext(request)),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('đẩy nguyên lỗi 401 từ AuthService ra ngoài', async () => {
      authService.authenticate.mockRejectedValue(
        new UnauthorizedException('Tài khoản không còn hiệu lực'),
      );
      const request: FakeRequest = { headers: { authorization: 'Bearer abc' } };
      await expect(
        makeGuard(false).canActivate(makeContext(request)),
      ).rejects.toThrow('Tài khoản không còn hiệu lực');
    });
  });
});
