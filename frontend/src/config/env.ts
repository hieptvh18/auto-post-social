/**
 * Nơi DUY NHẤT chạm `import.meta.env`. Component/api layer chỉ import từ đây.
 * Vite chỉ expose biến có tiền tố VITE_ (rule 04).
 */
export const env = {
  /** URL gốc backend, đã gồm prefix /api. Dev proxy Vite trỏ /api → backend. */
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  /** true = dùng MockDataContext, không gọi backend. */
  useMock: import.meta.env.VITE_USE_MOCK === 'true',
} as const;
