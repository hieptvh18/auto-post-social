import 'reflect-metadata';
import { IS_PUBLIC_KEY, Public } from '../public.decorator';
import {
  PERMISSIONS_KEY,
  RequirePermission,
} from '../require-permission.decorator';

describe('metadata decorators', () => {
  describe('Public', () => {
    it('gắn metadata isPublic=true lên class', () => {
      @Public()
      class Target {}

      expect(Reflect.getMetadata(IS_PUBLIC_KEY, Target)).toBe(true);
    });
  });

  describe('RequirePermission', () => {
    it('gắn danh sách permission lên class', () => {
      @RequirePermission('users:manage')
      class Target {}

      expect(Reflect.getMetadata(PERMISSIONS_KEY, Target)).toEqual([
        'users:manage',
      ]);
    });

    it('giữ nguyên thứ tự khi khai nhiều permission', () => {
      @RequirePermission('content:edit', 'content:review')
      class Target {}

      expect(Reflect.getMetadata(PERMISSIONS_KEY, Target)).toEqual([
        'content:edit',
        'content:review',
      ]);
    });
  });
});
