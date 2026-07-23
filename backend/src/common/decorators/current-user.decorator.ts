import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../types/authenticated-user';

/** Trích user đã xác thực từ request. Chỉ dùng sau JwtAuthGuard. */
export const currentUserFactory = (
  _data: unknown,
  context: ExecutionContext,
): AuthenticatedUser => {
  const request = context
    .switchToHttp()
    .getRequest<Request & { user?: AuthenticatedUser }>();
  return request.user as AuthenticatedUser;
};

export const CurrentUser = createParamDecorator(currentUserFactory);
