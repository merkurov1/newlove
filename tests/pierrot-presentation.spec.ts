import { test, expect } from '@playwright/test';

/**
 * Visual acceptance suite for the presentation engine.
 *
 * One page loads all deterministic preview fixtures; each case is then checked
 * and screenshotted at desktop, iPad and mobile widths. This avoids repeated
 * full reloads and keeps the suite stable in constrained CI containers.
 */
const VIEWPORTS = [
  { label: 'desktop', width: 1440, height: 1000 },
  { label: 'ipad-portrait', width: 820, height: 1180 },
  { label: 'mobile', width: 390, height: 844 },
];

const CASES = [
  'simple',
  'analysis',
  'msi',
  'timeline',
  'diagram',
  'comparison',
  'bluesky',
  'code',
  'quote',
  'table',
  'invalid',
  'old',
];

for (const viewport of VIEWPORTS) {
  test.describe(`presentation ${viewport.label}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('renders every representative composition without horizontal overflow', async ({
      page,
    }) => {
      await page.goto('/dev/pierrot-rendering');
      await expect(page.locator('[data-pierrot-response]').first()).toBeVisible();
      await page.waitForTimeout(1800);

      for (const caseId of CASES) {
        const section = page.locator(`#case-${caseId}`);
        await expect(section).toBeVisible();
        await section.scrollIntoViewIfNeeded();

        const overflow = await section.evaluate((element) => ({
          page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          section: element.scrollWidth - element.clientWidth,
        }));
        expect(overflow.page, `${caseId} page overflow`).toBeLessThanOrEqual(2);
        expect(overflow.section, `${caseId} section overflow`).toBeLessThanOrEqual(2);

        const typography = await section.evaluate((element) => {
          const response = element.querySelector<HTMLElement>('[data-pierrot-response]');
          const meta = response?.querySelector<HTMLElement>('figcaption, summary, dt');
          return {
            body: response ? Number.parseFloat(getComputedStyle(response).fontSize) : 0,
            meta: meta ? Number.parseFloat(getComputedStyle(meta).fontSize) : null,
          };
        });
        expect(typography.body, `${caseId} body size`).toBeGreaterThanOrEqual(15);
        if (typography.meta !== null) {
          expect(typography.meta, `${caseId} metadata size`).toBeGreaterThanOrEqual(9.5);
        }

        if (caseId === 'invalid') {
          await expect(section.getByText('Markdown fallback', { exact: false })).toBeVisible();
        }

        await section.screenshot({
          path: `test-results/presentation/${viewport.label}-${caseId}.png`,
        });
      }
    });
  });
}
