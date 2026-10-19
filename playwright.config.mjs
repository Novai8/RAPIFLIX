import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.RAPIFLIX_BASE_URL || 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome']
  },
  webServer: process.env.RAPIFLIX_BASE_URL ? undefined : {
    command: 'node tests/e2e/mock-server.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000
  }
});
