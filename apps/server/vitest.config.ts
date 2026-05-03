import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**', 'src/middleware/**', 'src/modules/**/**.service.ts', 'src/modules/**/**.routes.ts'],
      reporter: ['text', 'text-summary'],
    },
    testTimeout: 15000,
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
