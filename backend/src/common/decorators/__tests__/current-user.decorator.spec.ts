import type { ExecutionContext } from '@nestjs/common';
import { UserRole } from '../../../../generated/prisma/client';
import type { AuthenticatedUser } from '../../types/authenticated-user';
import { currentUserFactory } from '../current-user.decorator';

const user: AuthenticatedUser = {
  id: 'u1',
  email: 'a@x.local',
  name: 'Admin',
  role: UserRole.ADMIN,
};

const makeContext = (request: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

describe('currentUserFactory', () => {
  it('trả về user đã gắn trên request', () => {
    expect(currentUserFactory(undefined, makeContext({ user }))).toEqual(user);
  });

  it('trả undefined khi request chưa qua JwtAuthGuard', () => {
    expect(currentUserFactory(undefined, makeContext({}))).toBeUndefined();
  });
});
