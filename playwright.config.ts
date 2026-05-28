import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Load test credentials from .env.test if present (never committed)
config({ path: '.env.test', override: false });

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Start the dev server automatically when running locally
  webServer: process.env.CI
    ? undefined
    : {
        command: 'PORT=3100 pnpm dev:client',
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});
