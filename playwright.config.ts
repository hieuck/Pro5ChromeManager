import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E config for Pro5 Chrome Manager.
 * Requires the server to be built first: npm run build
 * Then starts the server automatically before running tests.
 */
export default defineConfig({
  testDir: './src/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  reporter: process.env['CI'] ? [['html', { open: 'never' }], ['github']] : [['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://127.0.0.1:33211',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'node scripts/run-e2e-server.js',
    url: 'http://127.0.0.1:33211/health',
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
