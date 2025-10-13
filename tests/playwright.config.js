/**
 * Playwright test configuration (scaffold)
 * - This is a lightweight scaffold so you can run e2e tests after installing @playwright/test
 */
module.exports = {
  testDir: './',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    headless: true,
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
    actionTimeout: 5000,
    ignoreHTTPSErrors: true,
  },
};
