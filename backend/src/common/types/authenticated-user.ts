import type { UserRole } from '../../../generated/prisma/client';

/** Payload gắn vào `request.user` sau khi JwtAuthGuard xác thực. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

/** Nội dung JWT. `sub` = user id (chuẩn RFC 7519). */
export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}
