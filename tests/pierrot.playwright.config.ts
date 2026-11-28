import path from 'node:path';
import { defineConfig } from '@playwright/test';

// Next.js 16 blocks dev resources (HMR/client bundles) when the page origin is
// not the configured dev origin. Keep the page on `localhost`; the Supabase
// stub can stay on the loopback IP because it only handles CORS-enabled XHR.
const appUrl = process.env.PIERROT_TEST_BASE_URL || 'http://localhost:3000';
const supabaseUrl = process.env.PIERROT_TEST_SUPABASE_URL || 'http://127.0.0.1:54321';
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.resolve(repoRoot, 'test-results/pierrot');
const reportDir = path.resolve(repoRoot, 'playwright-report/pierrot');

export default defineConfig({
  testDir: '.',
  testMatch: [
    'pierrot-viewport.spec.ts',
    'pierrot-presentation.spec.ts',
    'pierrot-browser.spec.ts',
    'absolution-redesign.spec.ts',
    'cast-redesign.spec.ts',
    'temple-sanctuary.spec.ts',
    'telegram-navigation.spec.ts',
    'flow-telegram-reader.spec.ts',
    'flow-composer.spec.ts',
    'flow-link-cards.spec.ts',
    'journal-redesign.spec.ts',
    'portfolio.spec.ts',
  ],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  // A first Next.js dev compile can be slower than the test body. Retrying once
  // in CI absorbs that startup cost without hiding a deterministic failure.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: reportDir }]]
    : 'list',
  outputDir,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000,
    baseURL: appUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node tests/support/supabase-stub.cjs',
      cwd: repoRoot,
      url: supabaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command: 'npm run dev',
      cwd: repoRoot,
      url: appUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        SUPABASE_URL: supabaseUrl,
        SUPABASE_KEY: 'test-anon-key',
      },
    },
  ],
});
