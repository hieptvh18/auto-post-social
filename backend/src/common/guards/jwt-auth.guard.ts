import {
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';
import { AuthService } from '../../modules/auth/auth.service';

/**
 * Xác thực access token rồi nạp lại user từ DB.
 * Đọc DB mỗi request để user bị khóa (isActive=false) mất hiệu lực ngay,
 * không phải chờ token hết hạn (plan 02 §3).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();

    const token = this.extractToken(request.headers.authorization);
    if (token === null) {
      throw new UnauthorizedException('Thiếu access token');
    }

    request.user = await this.authService.authenticate(token);
    return true;
  }

  private extractToken(header: string | undefined): string | null {
    if (header === undefined) return null;
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer') return null;
    if (value === undefined || value.trim() === '') return null;
    return value;
  }
}
