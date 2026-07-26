import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // File này chạy ở Node — không có `import.meta.env`, phải loadEnv thủ công.
  // Biến dưới đây CHỈ dùng cho dev server, không đi vào bundle production.
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [react()],
    server: {
      // Dev: chuyển /api → backend NestJS để tránh CORS.
      // Build production KHÔNG dùng proxy — FE gọi thẳng VITE_API_BASE_URL.
      proxy: {
        '/api': {
          target: env.VITE_DEV_PROXY_TARGET ?? 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
