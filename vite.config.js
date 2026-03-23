import { defineConfig } from 'vite';

export default defineConfig({
  // Serve from the project root
  root: '.',
  server: {
    port: 5173,
    open: false,
  },
  test: {
    // Vitest config (inline for simplicity)
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.js'],
  },
});
