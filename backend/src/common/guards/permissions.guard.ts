import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '../decorators/require-permission.decorator';
import { hasPermission, type Permission } from '../permissions';
import type { AuthenticatedUser } from '../types/authenticated-user';

/** Chạy SAU JwtAuthGuard — dựa vào `request.user` do guard đó gắn. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined || required.length === 0) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (user === undefined) {
      throw new UnauthorizedException('Chưa xác thực');
    }

    const allowed = required.every((p) => hasPermission(user.role, p));
    if (!allowed) {
      throw new ForbiddenException('Không đủ quyền thực hiện thao tác này');
    }
    return true;
  }
}
