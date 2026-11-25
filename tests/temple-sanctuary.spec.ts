import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts/temple-sanctuary');

const VIEWPORTS = [
  { label: 'desktop-1440x900', width: 1440, height: 900 },
  { label: 'tablet-768x1024', width: 768, height: 1024 },
  { label: 'mobile-390x844', width: 390, height: 844 },
] as const;

const LONG_TRACE =
  'A long and quiet confession that should stay on one desktop line while the complete sentence remains available in the DOM for assistive technology and for the reveal title.';

function feedPayload() {
  const createdAt = '2026-11-24T12:00:00.000Z';

  return {
    ok: true,
    data: [
      {
        id: 'trace-0',
        event_type: 'ASH',
        canonical_type: 'ASH',
        category: 'ritual',
        author: 'Alice',
        message: LONG_TRACE,
        created_at: createdAt,
        audio_url: null,
      },
      {
        id: 'trace-1',
        event_type: 'VIGIL_SPARK',
        canonical_type: 'VIGIL_SPARK',
        category: 'ritual',
        author: 'Pilgrim',
        message: 'Sent a Vigil spark.',
        created_at: '2026-11-24T11:59:00.000Z',
        audio_url: null,
      },
      {
        id: 'trace-2',
        event_type: 'CAST',
        canonical_type: 'CAST',
        category: 'ritual',
        author: 'Anton Merkurov',
        message: 'Cast an archetype.',
        created_at: '2026-11-24T11:58:00.000Z',
        audio_url: null,
      },
      {
        id: 'trace-3',
        event_type: 'ABSOLUTION',
        canonical_type: 'ABSOLUTION',
        category: 'ritual',
        author: 'Pilgrim',
        message: 'Received absolution.',
        created_at: '2026-11-24T11:57:00.000Z',
        audio_url: null,
      },
      {
        id: 'trace-4',
        event_type: 'TRIBUTE',
        canonical_type: 'TRIBUTE',
        category: 'ritual',
        author: 'Anonymous',
        message: 'Offered a Tribute.',
        created_at: '2026-11-24T11:56:00.000Z',
        audio_url: null,
      },
      {
        id: 'trace-5',
        event_type: 'MEDITATION',
        canonical_type: 'MEDITATION',
        category: 'ritual',
        author: 'Pilgrim',
        message: 'Found calm.',
        created_at: '2026-11-24T11:55:00.000Z',
        audio_url: null,
      },
      {
        id: 'trace-6',
        event_type: 'WHISPER',
        canonical_type: 'WHISPER',
        category: 'ritual',
        author: 'Pilgrim',
        message: 'Left a whisper.',
        created_at: '2026-11-24T11:54:00.000Z',
        audio_url: null,
      },
    ],
    stats: {
      completedRituals: 42,
      namedAuthors: 3,
      vigilSparks: 9,
      byType: {
        ASH: 7,
        VIGIL_SPARK: 9,
        CAST: 6,
        ABSOLUTION: 5,
        TRIBUTE: 4,
        MEDITATION: 6,
        WHISPER: 5,
      },
      windowDays: 30,
      windowStart: '2026-10-25T12:00:00.000Z',
      windowEnd: createdAt,
      excluded: { infrastructure: 11, incomplete: 4 },
      truncated: false,
    },
    meta: {
      generatedAt: createdAt,
      cachedAt: createdAt,
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

async function mockPublicApis(page: Page) {
  await page.route('**/api/temple_logs*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(feedPayload()),
    });
  });

  await page.route('**/api/vigil/state*', async (route) => {
    const lastLitAt = new Date().toISOString();

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        supporterCount: 12,
        lastLitAt,
        flameExpiresAt: new Date(
          Date.parse(lastLitAt) + 86_400_000
        ).toISOString(),
        flameLit: true,
        windowStartedAt: new Date(Date.now() - 86_400_000).toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
  });

  await page.route('**/api/tribute/summary*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total: 0 }),
    });
  });
}

async function openTemple(page: Page) {
  await mockPublicApis(page);
  await page.goto('/temple');
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });

  await expect(page.getByTestId('temple-heart')).toBeVisible();

  // The server already rendered a valid (possibly empty) snapshot from the
  // local stub. Force one documented refresh so the intercepted public feed
  // proves the visible trace path.
  await page
    .getByRole('button', { name: /Refresh the latest Temple traces/i })
    .click();

  await expect(
    page.getByRole('list', { name: 'Latest completed ritual traces' })
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Latest completed ritual traces' }).locator('li')
  ).toHaveCount(7);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );

  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectLightCanvas(page: Page) {
  const stage = page.locator('[data-temple-theme="light"]').first();

  await expect(stage).toBeVisible();

  const theme = await stage.evaluate((element) => {
    const computed = window.getComputedStyle(element);

    return {
      colorScheme: computed.colorScheme,
      color: computed.color,
      backgroundImage: computed.backgroundImage,
    };
  });

  expect(theme.colorScheme).toBe('light');
  expect(theme.color).toBe('rgb(37, 31, 26)');
  expect(theme.backgroundImage).toContain('rgb(246, 241, 232)');
  expect(theme.backgroundImage).not.toContain('rgb(11, 12, 16)');
}

test.describe('Temple Sanctuary', () => {
  test.beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  test('desktop keeps both stained-glass rails fixed while only the centre scrolls', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const leftRail = page.getByTestId('temple-left-rail');
    const rightRail = page.getByTestId('temple-right-rail');
    const center = page.getByTestId('temple-center-scroll');

    const [leftBefore, rightBefore, centerBox] = await Promise.all([
      leftRail.boundingBox(),
      rightRail.boundingBox(),
      center.boundingBox(),
    ]);

    expect(leftBefore).not.toBeNull();
    expect(rightBefore).not.toBeNull();
    expect(centerBox).not.toBeNull();

    expect(leftBefore!.x + leftBefore!.width).toBeLessThanOrEqual(centerBox!.x + 1);
    expect(rightBefore!.x).toBeGreaterThanOrEqual(
      centerBox!.x + centerBox!.width - 1
    );

    const windowScrollBefore = await page.evaluate(() => window.scrollY);

    await center.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });

    await expect
      .poll(() => center.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(200);

    const [leftAfter, rightAfter, windowScrollAfter] = await Promise.all([
      leftRail.boundingBox(),
      rightRail.boundingBox(),
      page.evaluate(() => window.scrollY),
    ]);

    expect(leftAfter!.x).toBeCloseTo(leftBefore!.x, 0);
    expect(leftAfter!.y).toBeCloseTo(leftBefore!.y, 0);
    expect(rightAfter!.x).toBeCloseTo(rightBefore!.x, 0);
    expect(rightAfter!.y).toBeCloseTo(rightBefore!.y, 0);
    expect(windowScrollAfter).toBe(windowScrollBefore);

    await expectNoHorizontalOverflow(page);
    await expectLightCanvas(page);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'desktop-1440x900-fixed-rails.png'),
    });

    await center.evaluate((element) => {
      element.scrollTop = 0;
    });

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'desktop-1440x900-top.png'),
    });
  });

  test('desktop traces stay on one visual line with the full text in the DOM', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const rows = page
      .getByRole('list', { name: 'Latest completed ritual traces' })
      .locator('li');
    const firstRow = rows.first();

    const metrics = await firstRow.evaluate((element) => {
      const body = element.children[1] as HTMLElement;
      const text = body.querySelector('span') as HTMLElement;

      return {
        rowHeight: element.getBoundingClientRect().height,
        bodyWhiteSpace: window.getComputedStyle(body).whiteSpace,
        bodyOverflow: window.getComputedStyle(body).overflow,
        textTextOverflow: window.getComputedStyle(text).textOverflow,
        textWhiteSpace: window.getComputedStyle(text).whiteSpace,
        textScrollWidth: text.scrollWidth,
        textClientWidth: text.clientWidth,
        title: element.getAttribute('title'),
        ariaLabel: element.getAttribute('aria-label'),
      };
    });

    expect(metrics.rowHeight).toBeLessThan(50);
    expect(metrics.bodyWhiteSpace).toBe('nowrap');
    expect(metrics.bodyOverflow).toBe('hidden');
    expect(metrics.textTextOverflow).toBe('ellipsis');
    expect(metrics.textWhiteSpace).toBe('nowrap');
    expect(metrics.textScrollWidth).toBeGreaterThan(metrics.textClientWidth);
    expect(metrics.title).toContain(LONG_TRACE);
    expect(metrics.ariaLabel).toContain(LONG_TRACE);
    await expect(firstRow).toContainText(LONG_TRACE);
  });

  for (const viewport of VIEWPORTS) {
    test(`renders without clipping or horizontal overflow on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openTemple(page);

      await expect(page.getByTestId('temple-left-panel')).toBeVisible();
      await expect(page.getByTestId('temple-right-panel')).toBeVisible();
      await expect(page.getByTestId('temple-heart')).toBeVisible();
      await expect(page.getByText('VIGIL · TAP THE HEART TO KEEP WATCH')).toBeVisible();

      await expectNoHorizontalOverflow(page);
      await expectLightCanvas(page);

      const rails = await Promise.all([
        page.getByTestId('temple-left-rail').boundingBox(),
        page.getByTestId('temple-right-rail').boundingBox(),
      ]);

      expect(rails[0]).not.toBeNull();
      expect(rails[1]).not.toBeNull();
      expect(rails[0]!.x + rails[0]!.width).toBeLessThanOrEqual(
        rails[1]!.x + 1
      );

      if (viewport.width < 1024) {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect
          .poll(() => page.evaluate(() => window.scrollY))
          .toBeGreaterThan(0);
        await expectNoHorizontalOverflow(page);
      } else {
        await page
          .getByTestId('temple-center-scroll')
          .evaluate((element) => {
            element.scrollTop = 0;
          });
      }

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}.png`),
        fullPage: viewport.width < 1024,
      });
    });
  }

  test('Telegram WebView stays light and usable without a nested scroll trap', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      type TestWindow = Window & {
        Telegram?: { WebApp: Record<string, unknown> };
        __templeTelegramHeaderColors?: string[];
      };

      const headerColors: string[] = [];

      (window as unknown as TestWindow).__templeTelegramHeaderColors =
        headerColors;

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
          setHeaderColor(color: string) {
            headerColors.push(color);
          },
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
    await expect(page.getByText('VIGIL · TAP THE HEART TO KEEP WATCH')).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectLightCanvas(page);

    const headerColors = await page.evaluate(
      () =>
        (
          window as Window & {
            __templeTelegramHeaderColors?: string[];
          }
        ).__templeTelegramHeaderColors || []
    );

    expect(headerColors).toContain('#f6f1e8');
    expect(headerColors).not.toContain('#141210');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'telegram-390x844.png'),
      fullPage: true,
    });
  });

  test('remains light under OS dark preference and a late-night clock', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      const RealDate = Date;
      const fixed = new RealDate('2026-11-24T23:30:00.000Z');

      class NightDate extends RealDate {
        constructor(value?: string | number | Date) {
          super(value === undefined ? fixed.getTime() : value);
        }

        static now() {
          return fixed.getTime();
        }
      }

      window.Date = NightDate as DateConstructor;
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    await expectLightCanvas(page);
    await expect(page.getByText('THE SANCTUARY', { exact: true })).toBeVisible();

    await page
      .getByTestId('temple-center-scroll')
      .evaluate((element) => {
        element.scrollTop = 0;
      });

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'desktop-1440x900-os-dark-night.png'),
    });
  });

  test('heart pulses only on hover or focus and respects reduced motion', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const heartLink = page.getByRole('link', { name: /Light the Vigil heart/ });
    const pulse = page.getByTestId('temple-heart-pulse');

    const animationName = () =>
      pulse.evaluate((element) => window.getComputedStyle(element).animationName);

    expect(await animationName()).toBe('none');

    await heartLink.hover();
    await expect.poll(animationName).toContain('temple-heart-pulse');

    await page.mouse.move(4, 4);
    await expect.poll(animationName).toBe('none');

    await heartLink.focus();
    await expect.poll(animationName).toContain('temple-heart-pulse');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await heartLink.hover();
    expect(await animationName()).toBe('none');
  });

  test('heart links to the real Vigil and shows the authoritative count', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const heartLink = page.getByRole('link', { name: /Light the Vigil heart/ });

    await expect(heartLink).toHaveAttribute('href', '/vigil');
    await expect(page.getByText('12 supporters')).toHaveAttribute(
      'data-supporter-count',
      '12'
    );

    await heartLink.click();
    await page.waitForURL('**/vigil');
  });

  test('four canonical ritual buttons keep their existing routes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const rituals = page.locator('section[aria-labelledby="rituals-title"]');

    await expect(rituals.getByRole('link')).toHaveCount(4);

    for (const [label, href] of [
      ['Calm', '/heartandangel/calm'],
      ['Let It Go', '/heartandangel/letitgo'],
      ['Absolution', '/absolution'],
      ['Cast', '/cast'],
    ] as const) {
      await expect(
        rituals.getByRole('link', { name: new RegExp(label) })
      ).toHaveAttribute('href', href);
    }
  });

  test('a specific amount starts Stripe immediately with no modal or /tribute hop', async ({
    page,
  }) => {
    const checkoutBodies: Array<Record<string, unknown>> = [];

    await page.route('**/api/tribute/checkout', async (route) => {
      checkoutBodies.push(JSON.parse(route.request().postData() || '{}'));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://checkout.stripe.com/c/pay/test',
          sessionId: 'cs_test_1234567890',
        }),
      });
    });

    await page.route('https://checkout.stripe.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body><h1>Stripe Hosted Checkout</h1><p>Explicit confirmation happens here.</p></body></html>',
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.getByRole('button', { name: '$5' }).click();

    await page.waitForURL('https://checkout.stripe.com/**');

    expect(checkoutBodies).toHaveLength(1);
    expect(checkoutBodies[0]).toMatchObject({
      amount: 5,
      currency: 'usd',
      message: 'Fuel for the Temple',
    });

    await expect(
      page.getByRole('heading', { name: 'Stripe Hosted Checkout' })
    ).toBeVisible();
  });

  test('the generic CTA opens the non-modal payment step and never /tribute', async ({
    page,
  }) => {
    const checkoutBodies: Array<Record<string, unknown>> = [];

    await page.route('**/api/tribute/checkout', async (route) => {
      checkoutBodies.push(JSON.parse(route.request().postData() || '{}'));

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          url: 'https://checkout.stripe.com/c/pay/test',
          sessionId: 'cs_test_1234567890',
        }),
      });
    });

    await page.route('https://checkout.stripe.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body><h1>Stripe Hosted Checkout</h1></body></html>',
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    await page
      .getByRole('link', { name: /support the temple/i })
      .click();

    await page.waitForURL('**/temple/support');
    expect(new URL(page.url()).pathname).toBe('/temple/support');
    expect(page.url()).not.toContain('/tribute');
    expect(checkoutBodies).toHaveLength(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'support-step-1440x900.png'),
    });

    await page.getByRole('button', { name: '$20' }).click();
    await page.waitForURL('https://checkout.stripe.com/**');

    expect(checkoutBodies).toHaveLength(1);
    expect(checkoutBodies[0]).toMatchObject({ amount: 20, currency: 'usd' });
  });
});
