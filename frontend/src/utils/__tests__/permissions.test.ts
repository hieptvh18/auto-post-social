import { describe, expect, it } from 'vitest';
import { can, canAccessRoute } from '../permissions';

describe('can', () => {
  it('ADMIN có mọi quyền quản trị', () => {
    expect(can('ADMIN', 'users:manage')).toBe(true);
    expect(can('ADMIN', 'settings:manage')).toBe(true);
    expect(can('ADMIN', 'pages:manage')).toBe(true);
  });

  it('EDITOR không quản lý user/page/settings', () => {
    expect(can('EDITOR', 'users:manage')).toBe(false);
    expect(can('EDITOR', 'pages:manage')).toBe(false);
    expect(can('EDITOR', 'settings:manage')).toBe(false);
    expect(can('EDITOR', 'content:review')).toBe(true);
  });

  it('CONTENT chỉ thao tác content của mình, không duyệt', () => {
    expect(can('CONTENT', 'content:create')).toBe(true);
    expect(can('CONTENT', 'content:review')).toBe(false);
    expect(can('CONTENT', 'autopost:manage')).toBe(false);
  });
});

describe('canAccessRoute', () => {
  it('route công khai (không khai báo) ai cũng vào', () => {
    expect(canAccessRoute('CONTENT', '/dashboard')).toBe(true);
    expect(canAccessRoute('CONTENT', '/guide')).toBe(true);
  });

  it('/users, /settings, /pages chỉ ADMIN', () => {
    for (const path of ['/users', '/settings', '/pages']) {
      expect(canAccessRoute('ADMIN', path)).toBe(true);
      expect(canAccessRoute('EDITOR', path)).toBe(false);
      expect(canAccessRoute('CONTENT', path)).toBe(false);
    }
  });

  it('/timeline và /auto-post cho ADMIN + EDITOR, chặn CONTENT', () => {
    for (const path of ['/timeline', '/auto-post']) {
      expect(canAccessRoute('ADMIN', path)).toBe(true);
      expect(canAccessRoute('EDITOR', path)).toBe(true);
      expect(canAccessRoute('CONTENT', path)).toBe(false);
    }
  });

  it('/content cho cả ba role', () => {
    expect(canAccessRoute('ADMIN', '/content')).toBe(true);
    expect(canAccessRoute('EDITOR', '/content')).toBe(true);
    expect(canAccessRoute('CONTENT', '/content')).toBe(true);
  });
});
