import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UserRole } from '../../../../generated/prisma/client';
import type { Permission } from '../../permissions';
import type { AuthenticatedUser } from '../../types/authenticated-user';
import { PermissionsGuard } from '../permissions.guard';

const makeContext = (user?: AuthenticatedUser): ExecutionContext =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const makeReflector = (required?: Permission[]): Reflector =>
  ({ getAllAndOverride: () => required }) as unknown as Reflector;

const admin: AuthenticatedUser = {
  id: 'u1',
  email: 'a@x.local',
  name: 'Admin',
  role: UserRole.ADMIN,
};
const content: AuthenticatedUser = { ...admin, role: UserRole.CONTENT };
const editor: AuthenticatedUser = { ...admin, role: UserRole.EDITOR };

describe('PermissionsGuard', () => {
  describe('canActivate', () => {
    it('cho qua khi route không khai báo permission', () => {
      const guard = new PermissionsGuard(makeReflector(undefined));
      expect(guard.canActivate(makeContext(content))).toBe(true);
    });

    it('cho qua khi mảng permission rỗng', () => {
      const guard = new PermissionsGuard(makeReflector([]));
      expect(guard.canActivate(makeContext(content))).toBe(true);
    });

    it('ném UnauthorizedException khi chưa có request.user', () => {
      const guard = new PermissionsGuard(makeReflector(['users:manage']));
      expect(() => guard.canActivate(makeContext(undefined))).toThrow(
        UnauthorizedException,
      );
    });

    it('cho ADMIN qua users:manage', () => {
      const guard = new PermissionsGuard(makeReflector(['users:manage']));
      expect(guard.canActivate(makeContext(admin))).toBe(true);
    });

    it('chặn CONTENT vào users:manage bằng 403', () => {
      const guard = new PermissionsGuard(makeReflector(['users:manage']));
      expect(() => guard.canActivate(makeContext(content))).toThrow(
        ForbiddenException,
      );
    });

    it('chặn EDITOR vào users:manage bằng 403', () => {
      const guard = new PermissionsGuard(makeReflector(['users:manage']));
      expect(() => guard.canActivate(makeContext(editor))).toThrow(
        ForbiddenException,
      );
    });

    it('chặn CONTENT khi thiếu 1 trong nhiều permission yêu cầu', () => {
      const guard = new PermissionsGuard(
        makeReflector(['content:edit', 'content:review']),
      );
      expect(() => guard.canActivate(makeContext(content))).toThrow(
        ForbiddenException,
      );
    });

    it('cho EDITOR qua khi đủ mọi permission yêu cầu', () => {
      const guard = new PermissionsGuard(
        makeReflector(['content:edit', 'content:review']),
      );
      expect(guard.canActivate(makeContext(editor))).toBe(true);
    });
  });
});
