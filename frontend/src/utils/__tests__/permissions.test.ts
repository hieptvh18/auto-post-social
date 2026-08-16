import { describe, expect, it } from 'vitest';
import {
  RESTRICTED_ROUTES,
  can,
  canAccessRoute,
  defaultRouteFor,
} from '../permissions';

describe('can', () => {
  it('ADMIN có mọi quyền quản trị', () => {
    expect(can('ADMIN', 'users:manage')).toBe(true);
    expect(can('ADMIN', 'settings:manage')).toBe(true);
    expect(can('ADMIN', 'pages:manage')).toBe(true);
  });

  it('SUPER_ADMIN có reup:*, ADMIN thì KHÔNG (plan 26)', () => {
    expect(can('SUPER_ADMIN', 'reup:view')).toBe(true);
    expect(can('SUPER_ADMIN', 'reup:manage')).toBe(true);
    expect(can('ADMIN', 'reup:view')).toBe(false);
    expect(can('ADMIN', 'reup:manage')).toBe(false);
    expect(can('EDITOR', 'reup:view')).toBe(false);
    expect(can('CONTENT', 'reup:view')).toBe(false);
  });

  it('SUPER_ADMIN giữ đủ mọi quyền của ADMIN (chống hồi quy)', () => {
    for (const permission of [
      'users:manage',
      'pages:manage',
      'content:create',
      'content:edit',
      'content:delete',
      'content:review',
      'autopost:manage',
      'timeline:view',
      'queue:view',
      'jobs:retry',
      'dashboard:view',
      'settings:manage',
      'audit:view',
    ] as const) {
      expect(can('SUPER_ADMIN', permission)).toBe(true);
    }
  });

  it('EDITOR chỉ có quyền trên màn Quản lý Ảnh/Video', () => {
    expect(can('EDITOR', 'content:review')).toBe(true);
    expect(can('EDITOR', 'content:edit')).toBe(true);
    expect(can('EDITOR', 'users:manage')).toBe(false);
    expect(can('EDITOR', 'pages:manage')).toBe(false);
    expect(can('EDITOR', 'settings:manage')).toBe(false);
    expect(can('EDITOR', 'autopost:manage')).toBe(false);
    expect(can('EDITOR', 'timeline:view')).toBe(false);
    expect(can('EDITOR', 'dashboard:view')).toBe(false);
  });

  it('CONTENT chỉ thao tác content của mình, không duyệt', () => {
    expect(can('CONTENT', 'content:create')).toBe(true);
    expect(can('CONTENT', 'content:review')).toBe(false);
    expect(can('CONTENT', 'autopost:manage')).toBe(false);
  });
});

describe('canAccessRoute', () => {
  it('/guide ai cũng vào; /dashboard chặn EDITOR', () => {
    expect(canAccessRoute('CONTENT', '/guide')).toBe(true);
    expect(canAccessRoute('EDITOR', '/guide')).toBe(true);
    expect(canAccessRoute('CONTENT', '/dashboard')).toBe(true);
    expect(canAccessRoute('EDITOR', '/dashboard')).toBe(false);
  });

  it('/users, /settings, /pages chỉ ADMIN', () => {
    for (const path of ['/users', '/settings', '/pages']) {
      expect(canAccessRoute('ADMIN', path)).toBe(true);
      expect(canAccessRoute('EDITOR', path)).toBe(false);
      expect(canAccessRoute('CONTENT', path)).toBe(false);
    }
  });

  it('/timeline và /auto-post chỉ ADMIN', () => {
    for (const path of ['/timeline', '/auto-post']) {
      expect(canAccessRoute('ADMIN', path)).toBe(true);
      expect(canAccessRoute('EDITOR', path)).toBe(false);
      expect(canAccessRoute('CONTENT', path)).toBe(false);
    }
  });

  it('/content cho cả ba role', () => {
    expect(canAccessRoute('ADMIN', '/content')).toBe(true);
    expect(canAccessRoute('EDITOR', '/content')).toBe(true);
    expect(canAccessRoute('CONTENT', '/content')).toBe(true);
  });

  it('EDITOR chỉ còn đúng 2 màn: /content và /guide', () => {
    const allowed = [
      '/dashboard',
      '/content',
      '/guide',
      '/timeline',
      '/auto-post',
      '/pages',
      '/users',
      '/settings',
      '/queue',
      '/failed',
      '/audit',
    ].filter((path) => canAccessRoute('EDITOR', path));

    expect(allowed).toEqual(['/content', '/guide']);
  });
});

/**
 * Cạm bẫy C1 / rủi ro R1 của plan 26: quên thêm SUPER_ADMIN vào một dòng bất kỳ
 * của `RESTRICTED_ROUTES` ⇒ super-admin đăng nhập xong trắng menu. Vì vậy test
 * duyệt **toàn bộ key của chính map đó** (không liệt kê tay vài route mẫu —
 * liệt kê tay thì thêm route mới là test lại mù).
 */
describe('canAccessRoute — SUPER_ADMIN (plan 26 C1)', () => {
  it.each(Object.keys(RESTRICTED_ROUTES))(
    'SUPER_ADMIN vào được %s',
    (path) => {
      expect(canAccessRoute('SUPER_ADMIN', path)).toBe(true);
    },
  );

  it('mọi route ADMIN vào được thì SUPER_ADMIN cũng vào được', () => {
    for (const path of Object.keys(RESTRICTED_ROUTES)) {
      if (canAccessRoute('ADMIN', path)) {
        expect(canAccessRoute('SUPER_ADMIN', path)).toBe(true);
      }
    }
  });

  it('/reup CHỈ SUPER_ADMIN — ba role kia đều bị chặn', () => {
    expect(canAccessRoute('SUPER_ADMIN', '/reup')).toBe(true);
    expect(canAccessRoute('ADMIN', '/reup')).toBe(false);
    expect(canAccessRoute('EDITOR', '/reup')).toBe(false);
    expect(canAccessRoute('CONTENT', '/reup')).toBe(false);
  });
});

describe('defaultRouteFor', () => {
  it('EDITOR về /content vì không vào được /dashboard', () => {
    expect(defaultRouteFor('EDITOR')).toBe('/content');
    expect(defaultRouteFor('ADMIN')).toBe('/dashboard');
    expect(defaultRouteFor('CONTENT')).toBe('/dashboard');
  });

  it('SUPER_ADMIN về /dashboard và route đó vào được thật', () => {
    const route = defaultRouteFor('SUPER_ADMIN');
    expect(route).toBe('/dashboard');
    // Chống vòng redirect vô hạn: route mặc định phải thực sự truy cập được.
    expect(canAccessRoute('SUPER_ADMIN', route)).toBe(true);
  });
});
