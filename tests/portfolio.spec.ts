import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'mobile', width: 390, height: 844 },
] as const;

test.describe('/portfolio', () => {
  for (const viewport of VIEWPORTS) {
    test(`renders without horizontal overflow on ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const response = await page.goto('/portfolio', { waitUntil: 'networkidle' });

      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Anton\s+Merkurov/);
      await expect(
        page.getByRole('button', { name: 'Save this portfolio as a PDF' })
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Heart & Angel' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'The Temple' })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  test('uses the native print dialog and hides site chrome in print', async ({ page }) => {
    await page.addInitScript(() => {
      (window as Window & { __portfolioPrinted?: boolean }).print = () => {
        (window as Window & { __portfolioPrinted?: boolean }).__portfolioPrinted = true;
      };
    });

    await page.goto('/portfolio', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Save this portfolio as a PDF' }).click();

    expect(
      await page.evaluate(
        () => (window as Window & { __portfolioPrinted?: boolean }).__portfolioPrinted
      )
    ).toBe(true);

    await page.emulateMedia({ media: 'print' });

    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('.site-footer')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Save this portfolio as a PDF' })).toBeHidden();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.byteLength).toBeGreaterThan(100_000);
  });
});
