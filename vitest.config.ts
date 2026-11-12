import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // The check tests spawn git and oxlint on a scratch repo.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
