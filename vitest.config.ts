import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Run test files sequentially so env var mutations (DATABASE_URL) don't
    // race across files that share the same process environment.
    fileParallelism: false,
  },
});
