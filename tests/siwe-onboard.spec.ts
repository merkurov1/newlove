import { test, expect } from '@playwright/test';

test('onboard page shows login button', async ({ page }) => {
  await page.goto('/onboard');
  // Check for a typical login button or link text used by the app
  const login = page.locator('text=Log in').first();
  await expect(login).toBeVisible();
});
