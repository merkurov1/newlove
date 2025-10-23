const { test, expect } = require('@playwright/test');

test.describe('SIWE / Onboard scaffold', () => {
  test('visit onboard page and find login CTA', async ({ page }) => {
    await page.goto('/onboard');
    // Basic smoke check: a login button or wallet connect button should exist
    const loginButton = page.locator('text=Connect Wallet, button:has-text("Connect"), button:has-text("Войти")');
    await expect(loginButton.first()).toBeVisible({ timeout: 5000 });
  });
});
