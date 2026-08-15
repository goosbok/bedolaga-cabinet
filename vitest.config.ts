import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts so the app build config stays untouched;
// unit tests run in a plain node environment (no jsdom needed — tests that
// touch browser globals stub them with vi.stubGlobal).
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
