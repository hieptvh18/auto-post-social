import { describe, expect, it } from 'vitest';
import { can, canAccessRoute, defaultRouteFor } from '../permissions';

describe('can', () => {
  it('ADMIN có mọi quyền quản trị', () => {
    expect(can('ADMIN', 'users:manage')).toBe(true);
    expect(can('ADMIN', 'settings:manage')).toBe(true);
    expect(can('ADMIN', 'pages:manage')).toBe(true);
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

describe('defaultRouteFor', () => {
  it('EDITOR về /content vì không vào được /dashboard', () => {
    expect(defaultRouteFor('EDITOR')).toBe('/content');
    expect(defaultRouteFor('ADMIN')).toBe('/dashboard');
    expect(defaultRouteFor('CONTENT')).toBe('/dashboard');
  });
});
