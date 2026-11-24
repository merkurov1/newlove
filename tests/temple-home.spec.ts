import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts/temple-integration');

const VIEWPORTS = [
  { label: 'desktop-1440x900', width: 1440, height: 900 },
  { label: 'tablet-768x1024', width: 768, height: 1024 },
  { label: 'mobile-390x844', width: 390, height: 844 },
] as const;

/**
 * The seven real public rows and aggregate values observed through
 * `GET https://www.merkurov.love/api/temple_logs` at 2026-11-24T16:22Z.
 * They are used only as a local response fixture; no row is invented and no
 * production write is performed.
 */
const OBSERVED_TRACES = [
  {
    id: '794',
    event_type: 'MEDITATION',
    author: 'merkurov',
    message: 'Spent 3 seconds finding calm.',
    created_at: '2026-11-24T16:14:12.213+00:00',
  },
  {
    id: '792',
    event_type: 'MEDITATION',
    author: 'Anton Merkurov',
    message: 'Spent 3 seconds finding calm.',
    created_at: '2026-11-24T15:01:59.391+00:00',
  },
  {
    id: '791',
    event_type: 'ASH',
    author: 'Anton Merkurov',
    message: 'Released 1 burden into the digital sky.',
    created_at: '2026-11-24T14:41:04.156+00:00',
  },
  {
    id: '790',
    event_type: 'MEDITATION',
    author: 'Anton Merkurov',
    message: 'Spent 3 seconds finding calm.',
    created_at: '2026-11-24T14:40:57.609+00:00',
  },
  {
    id: '789',
    event_type: 'MEDITATION',
    author: 'Anton Merkurov',
    message: 'Spent 6 seconds finding calm.',
    created_at: '2026-11-24T13:35:54.44+00:00',
  },
  {
    id: '788',
    event_type: 'ABSOLUTION',
    author: 'Anton Merkurov',
    message:
      'Anton Merkurov confessed: "Doomscrolling past 3 AM" and received joyous absolution.',
    created_at: '2026-11-24T12:32:17.157+00:00',
  },
  {
    id: '787',
    event_type: 'ASH',
    author: 'Anton Merkurov',
    message: 'Released 3 burdens into the digital sky.',
    created_at: '2026-11-24T12:29:14.558+00:00',
  },
] as const;

function feedPayload() {
  const generatedAt = '2026-11-24T16:22:24.162Z';

  return {
    ok: true,
    data: OBSERVED_TRACES.map((trace) => ({
      ...trace,
      canonical_type: trace.event_type,
      category: 'ritual',
      audio_url: null,
    })),
    stats: {
      completedRituals: 38,
      namedAuthors: 3,
      vigilSparks: 18,
      byType: { MEDITATION: 15, ASH: 3, ABSOLUTION: 2, VIGIL_SPARK: 18 },
      windowDays: 30,
      windowStart: '2026-10-25T16:22:24.162Z',
      windowEnd: generatedAt,
      excluded: { infrastructure: 4, incomplete: 2 },
      truncated: false,
    },
    meta: {
      generatedAt,
      cachedAt: generatedAt,
      ttlSeconds: 60,
      traceLimit: 7,
      windowDays: 30,
      stale: false,
      cache: 'miss',
      truncated: false,
      definitions: {},
    },
    error: null,
  };
}

async function openTemple(page: Page) {
  await page.route('**/api/temple_logs*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(feedPayload()),
    });
  });

  await page.goto('/temple');
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );

  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('Temple integration', () => {
  test.beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  for (const viewport of VIEWPORTS) {
    test(`shows the approved hero and seven real traces on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openTemple(page);

      const heart = page.getByTestId('temple-heart');
      const angel = page.getByTestId('temple-left-panel');
      const demon = page.getByTestId('temple-right-panel');
      const title = page.locator('h1').first();

      await expect(heart).toBeVisible();
      await expect(angel).toBeVisible();
      await expect(demon).toBeVisible();

      const heartBox = await heart.boundingBox();
      const angelBox = await angel.boundingBox();
      const demonBox = await demon.boundingBox();
      const titleBox = await title.boundingBox();

      expect(heartBox).not.toBeNull();
      expect(angelBox).not.toBeNull();
      expect(demonBox).not.toBeNull();
      expect(titleBox).not.toBeNull();

      // The heart is the first visual element, centred on the page axis.
      const heartCentre = heartBox!.x + heartBox!.width / 2;
      expect(Math.abs(heartCentre - viewport.width / 2)).toBeLessThan(4);
      expect(heartBox!.y).toBeLessThan(titleBox!.y);

      // The figures sit at the outer edges of the hero on wide screens and in
      // the two outer columns beneath the heart on phones.
      expect(angelBox!.x).toBeLessThan(demonBox!.x);
      if (viewport.width >= 861) {
        expect(angelBox!.x).toBeLessThan(viewport.width * 0.2);
        expect(demonBox!.x + demonBox!.width).toBeGreaterThan(
          viewport.width * 0.8
        );
      }

      // Owner rule: the supplied artwork is open, never framed as a card.
      const angelStyle = await angel.evaluate((image) => {
        const style = window.getComputedStyle(image);
        const figure = image.closest('figure');
        const figureStyle = figure
          ? window.getComputedStyle(figure)
          : null;

        return {
          borderWidth: style.borderWidth,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          background: style.backgroundColor,
          filter: style.filter,
          figureBorderWidth: figureStyle?.borderWidth ?? '0px',
          figureBackground: figureStyle?.backgroundColor ?? 'transparent',
          figureShadow: figureStyle?.boxShadow ?? 'none',
        };
      });

      expect(angelStyle.borderWidth).toBe('0px');
      expect(angelStyle.borderRadius).toBe('0px');
      expect(angelStyle.boxShadow).toBe('none');
      expect(angelStyle.background).toBe('rgba(0, 0, 0, 0)');
      expect(angelStyle.filter).not.toContain('drop-shadow');
      expect(angelStyle.figureBorderWidth).toBe('0px');
      expect(angelStyle.figureBackground).toBe('rgba(0, 0, 0, 0)');
      expect(angelStyle.figureShadow).toBe('none');

      const rituals = page
        .getByRole('heading', { name: 'Rituals' })
        .locator('..');
      await expect(rituals).toBeVisible();

      const traces = page.getByRole('region', { name: 'Traces' });
      await expect(traces).toBeVisible();

      // The local Supabase stub has no temple_log rows. Force one documented
      // refresh so the intercepted API fixture proves the visible log path.
      await page
        .getByRole('button', { name: /Refresh the latest Temple traces/i })
        .click();

      await expect
        .poll(() => traces.getByRole('listitem').count())
        .toBe(7);

      await expect(
        traces.getByText('merkurov', { exact: true })
      ).toBeVisible();
      await expect(
        traces.getByText('Released 1 burden into the digital sky.')
      ).toBeVisible();
      await expect(
        traces.getByText(/entry, navigation and incomplete events excluded/i)
      ).toBeVisible();

      await expectNoHorizontalOverflow(page);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}.png`),
        fullPage: true,
      });
    });
  }

  test('renders the same homepage in a Telegram WebView', async ({ page }) => {
    await page.addInitScript(() => {
      type TestWindow = Window & {
        Telegram?: { WebApp: Record<string, unknown> };
      };

      (window as unknown as TestWindow).Telegram = {
        WebApp: {
          initData: 'audit-init-data',
          initDataUnsafe: {
            user: { first_name: 'Pilgrim', username: 'pilgrim' },
          },
          viewportHeight: window.innerHeight,
          viewportStableHeight: window.innerHeight,
          safeAreaInset: { top: 0, right: 0, bottom: 0, left: 0 },
          contentSafeAreaInset: { top: 0, right: 0, bottom: 0, left: 0 },
          ready() {},
          expand() {},
          onEvent() {},
          offEvent() {},
          setHeaderColor() {},
          setBackgroundColor() {},
          setBottomBarColor() {},
          HapticFeedback: { impactOccurred() {} },
          BackButton: {
            show() {},
            hide() {},
            onClick() {},
            offClick() {},
          },
        },
      };
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await openTemple(page);

    await expect(page.locator('body')).toHaveClass(/telegram-app/);
    await expect(page.getByTestId('temple-heart')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Traces' })).toBeVisible();

    await page
      .getByRole('button', { name: /Refresh the latest Temple traces/i })
      .click();

    await expect
      .poll(() =>
        page
          .getByRole('region', { name: 'Traces' })
          .getByRole('listitem')
          .count()
      )
      .toBe(7);

    await expectNoHorizontalOverflow(page);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'telegram-390x844.png'),
      fullPage: true,
    });
  });
});
