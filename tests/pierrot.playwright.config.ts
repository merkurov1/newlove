import { defineConfig } from '@playwright/test';

const appUrl = process.env.PIERROT_TEST_BASE_URL || 'http://127.0.0.1:3000';
const supabaseUrl = process.env.PIERROT_TEST_SUPABASE_URL || 'http://127.0.0.1:54321';

export default defineConfig({
  testDir: '.',
  testMatch: 'pierrot-viewport.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 10_000,
    baseURL: appUrl,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node tests/support/supabase-stub.cjs',
      url: supabaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
    {
      command: 'npm run dev',
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
