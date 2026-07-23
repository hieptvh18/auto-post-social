import { defineConfig } from 'vitest/config';

// Cấu hình test tách riêng khỏi vite.config.ts để tránh xung đột type giữa
// vite (rolldown) và bản vite mà vitest kéo theo.
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
