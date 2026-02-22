import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3002';
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 4,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    navigationTimeout: 10_000,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      cwd: '../..',
      url: `${API_URL}/health`,
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: 'npm run dev:web',
      cwd: '../..',
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 30_000,
    },
  ],
});
