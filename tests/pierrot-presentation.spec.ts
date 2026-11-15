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
  'bar',
  'pie',
  'mixed',
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

const CHART_CASES = [
  { id: 'msi', kind: 'line', minShapes: 1, label: '2026-09-01' },
  { id: 'bar', kind: 'bar', minShapes: 3, label: 'Direct' },
  { id: 'pie', kind: 'pie', minShapes: 3, label: 'Эссе' },
  { id: 'bluesky', kind: 'stacked_bar', minShapes: 3, label: 'Digital Temple' },
  { id: 'mixed', kind: 'line', minShapes: 1, label: 'Пн' },
] as const;

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

/**
 * The older suite only checked that a container existed. These assertions
 * require the real Recharts SVG with rendered shapes, axis labels and the
 * values from the block. No chart component is mocked.
 */
test.describe('real chart rendering', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('renders line, bar, pie, temporal and mixed compositions from real data', async ({
    page,
  }) => {
    await page.goto('/dev/pierrot-rendering');
    await expect(page.locator('[data-pierrot-response]').first()).toBeVisible();

    for (const chartCase of CHART_CASES) {
      const section = page.locator(`#case-${chartCase.id}`);
      await expect(section).toBeVisible();
      await section.scrollIntoViewIfNeeded();

      const chart = section.locator('[data-pierrot-response] svg.recharts-surface').first();
      await expect(chart, `${chartCase.id} real SVG chart`).toBeVisible();

      const shapeSelector =
        chartCase.kind === 'pie'
          ? 'path.recharts-sector'
          : chartCase.kind === 'bar' || chartCase.kind === 'stacked_bar'
            ? 'path.recharts-rectangle'
            : 'path.recharts-line-curve, path.recharts-curve';

      await expect
        .poll(async () => chart.locator(shapeSelector).count(), {
          message: `${chartCase.id} should render real chart shapes`,
        })
        .toBeGreaterThanOrEqual(chartCase.minShapes);

      const shapes = await chart.locator(shapeSelector).evaluateAll((elements) =>
        elements.map((element) => {
          if (element instanceof SVGPathElement) {
            return element.getAttribute('d') || '';
          }
          return element.getAttribute('width') || element.getAttribute('height') || 'shape';
        })
      );
      expect(shapes.some((value) => value.length > 4), `${chartCase.id} shape geometry`).toBe(true);

      const labels = await chart.locator('text').allTextContents();
      const sectionText = await section.innerText();
      expect(
        `${labels.join(' ')} ${sectionText}`,
        `${chartCase.id} should show a real axis or slice label`
      ).toContain(chartCase.label);

      const overflow = await section.evaluate((element) => ({
        section: element.scrollWidth - element.clientWidth,
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }));
      expect(overflow.section, `${chartCase.id} section overflow`).toBeLessThanOrEqual(2);
      expect(overflow.page, `${chartCase.id} page overflow`).toBeLessThanOrEqual(2);
    }
  });

  test('mixed composition keeps the table and the chart aligned to the same values', async ({
    page,
  }) => {
    await page.goto('/dev/pierrot-rendering?case=mixed');
    const section = page.locator('#case-mixed');
    await expect(section).toBeVisible();

    const response = section.locator('[data-pierrot-response]').last();
    await expect(response.locator('table tbody tr')).toHaveCount(2);
    await expect(response.locator('table tbody')).toContainText('120');
    await expect(response.locator('table tbody')).toContainText('140');

    const chart = response.locator('svg.recharts-surface').first();
    await expect(chart).toBeVisible();
    await expect
      .poll(async () => chart.locator('path.recharts-line-curve, path.recharts-curve').count())
      .toBeGreaterThanOrEqual(1);
    await expect(chart).toContainText('Пн');
  });
});
