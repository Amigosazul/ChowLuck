import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787'
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts']
  }
});
