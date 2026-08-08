import { renderHook, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsMobile, useIsPhone } from '../useResponsive';

/** Điều khiển tay `matchMedia` để test không phụ thuộc kích thước cửa sổ thật. */
function installMatchMedia(matchesFor: (query: string) => boolean) {
  const listeners = new Map<string, Set<() => void>>();

  const mock = vi.fn((query: string) => ({
    matches: matchesFor(query),
    media: query,
    addEventListener: (_: string, cb: () => void) => {
      const set = listeners.get(query) ?? new Set();
      set.add(cb);
      listeners.set(query, set);
    },
    removeEventListener: (_: string, cb: () => void) => {
      listeners.get(query)?.delete(cb);
    },
  }));

  Object.defineProperty(window, 'matchMedia', {
    value: mock,
    configurable: true,
    writable: true,
  });

  return {
    /** Giả lập xoay máy / đổi kích thước: bắn change cho mọi listener. */
    fireChange: () => {
      for (const set of listeners.values()) {
        for (const cb of set) cb();
      }
    },
  };
}

afterEach(() => {
  // Trả về trạng thái "jsdom không có matchMedia" như mặc định của môi trường test.
  Reflect.deleteProperty(window, 'matchMedia');
  vi.restoreAllMocks();
});

describe('useResponsive', () => {
  describe('useIsMobile', () => {
    it('trả false khi môi trường không có matchMedia (jsdom) — coi như desktop', () => {
      Reflect.deleteProperty(window, 'matchMedia');

      const { result } = renderHook(() => useIsMobile());

      expect(result.current).toBe(false);
    });

    it('trả true ngay ở lần render đầu tiên khi viewport hẹp', () => {
      installMatchMedia(() => true);

      const { result } = renderHook(() => useIsMobile());

      // Quan trọng: đúng NGAY, không phải sau một effect — nếu sai thì mở trang
      // trên điện thoại sẽ nháy bố cục desktop một nhịp.
      expect(result.current).toBe(true);
    });

    it('cập nhật khi viewport đổi từ hẹp sang rộng', () => {
      let narrow = true;
      const { fireChange } = installMatchMedia(() => narrow);

      const { result } = renderHook(() => useIsMobile());
      expect(result.current).toBe(true);

      narrow = false;
      act(() => fireChange());

      expect(result.current).toBe(false);
    });
  });

  describe('useIsPhone', () => {
    it('dùng ngưỡng hẹp hơn useIsMobile — tablet là mobile nhưng không phải phone', () => {
      // Giả lập viewport 800px: khớp (max-width: 991px), không khớp (max-width: 767px).
      installMatchMedia((query) => query.includes('991'));

      const mobile = renderHook(() => useIsMobile());
      const phone = renderHook(() => useIsPhone());

      expect(mobile.result.current).toBe(true);
      expect(phone.result.current).toBe(false);
    });
  });
});
