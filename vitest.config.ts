import path from 'node:path';

import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so the app build config stays untouched;
// unit tests run in a plain node environment (no jsdom needed — tests that
// touch browser globals stub them with vi.stubGlobal).
export default defineConfig({
  // Mirrors the '@' alias from vite.config.ts so modules that use it are testable.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
