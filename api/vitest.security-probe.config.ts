import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'src/security-probe/**/*.test.ts',
      'src/middleware/errorHandler.test.ts',
    ],
  },
});
