import { SetMetadata, type CustomDecorator } from '@nestjs/common';
import type { Permission } from '../permissions';

export const PERMISSIONS_KEY = 'permissions';

/** Gắn permission yêu cầu lên handler; PermissionsGuard đọc lại metadata này. */
export const RequirePermission = (
  ...permissions: Permission[]
): CustomDecorator<string> => SetMetadata(PERMISSIONS_KEY, permissions);
