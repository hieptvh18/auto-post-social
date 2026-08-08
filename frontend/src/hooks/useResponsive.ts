import { useSyncExternalStore } from 'react';

/**
 * Ngưỡng chuyển sang bố cục "màn hẹp" (mobile + tablet dọc).
 * Trùng breakpoint `lg` của Ant Design (992px) để Col `lg={...}` và sidebar
 * đổi hình cùng một lúc — nếu lệch nhau sẽ có dải màn hình mà sidebar đã thu
 * nhưng lưới vẫn xếp ngang, nhìn như vỡ.
 */
export const MOBILE_MAX_WIDTH = 991;

/** Ngưỡng "điện thoại" — dùng cho các chỗ cần thu gọn mạnh hơn tablet. */
export const PHONE_MAX_WIDTH = 767;

interface QueryStore {
  subscribe: (onChange: () => void) => () => void;
  getSnapshot: () => boolean;
}

/**
 * Cache theo query: `useSyncExternalStore` so sánh tham chiếu hàm, tạo hàm mới
 * mỗi lần render sẽ khiến React huỷ/đăng ký lại listener liên tục.
 */
const stores = new Map<string, QueryStore>();

function hasMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function storeFor(query: string): QueryStore {
  const cached = stores.get(query);
  if (cached) return cached;

  const store: QueryStore = {
    subscribe: (onChange) => {
      if (!hasMatchMedia()) return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    getSnapshot: () => (hasMatchMedia() ? window.matchMedia(query).matches : false),
  };
  stores.set(query, store);
  return store;
}

/**
 * Trả về true khi viewport khớp media query.
 *
 * Dùng `useSyncExternalStore` chứ không phải `useState + useEffect` để giá trị
 * đúng ngay ở lần render ĐẦU TIÊN — nếu để mặc định rồi sửa trong effect thì
 * mở trang trên điện thoại sẽ thấy sidebar desktop nháy lên một nhịp.
 * Môi trường không có `matchMedia` (jsdom trong test) ⇒ luôn false = desktop.
 */
function useMediaQuery(query: string): boolean {
  const store = storeFor(query);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => false);
}

/** Màn hẹp: sidebar chuyển thành Drawer, lưới xếp dọc. */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_MAX_WIDTH}px)`);
}

/** Điện thoại: thu gọn mạnh (bỏ cột phụ, nút chỉ còn icon...). */
export function useIsPhone(): boolean {
  return useMediaQuery(`(max-width: ${PHONE_MAX_WIDTH}px)`);
}
