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
        description: LONG_TRACE,
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
        description: 'Sent a Vigil spark.',
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
        description: 'Cast an archetype.',
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
        description: 'Completed the Absolution ritual.',
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
        description: 'Offered a Tribute.',
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
        description: 'Found calm.',
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
        description: 'Left a whisper.',
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
        lifetimeTotal: 137,
        uniqueParticipants: 96,
        returningParticipants: 21,
        repeatRate: 0.2188,
        telegramParticipants: 60,
        supabaseParticipants: 36,
        analyticsSince: '2026-11-16T00:00:00.000Z',
        analyticsAvailable: true,
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
    page.getByRole('list', { name: 'Latest ritual traces' })
  ).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Latest ritual traces' }).locator('li')
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
    const body = window.getComputedStyle(document.body);

    return {
      colorScheme: computed.colorScheme,
      color: computed.color,
      bodyColor: body.backgroundColor,
      bodyImage: body.backgroundImage,
      bodyAttachment: body.backgroundAttachment,
    };
  });

  expect(theme.colorScheme).toBe('light');
  expect(theme.color).toBe('rgb(37, 31, 26)');
  expect(theme.bodyColor).toBe('rgb(246, 241, 232)');
  expect(theme.bodyImage).toContain('rgba(124, 84, 214, 0.16)');
  expect(theme.bodyImage).toContain('rgba(200, 32, 43, 0.12)');
  expect(theme.bodyAttachment).toBe('fixed');
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
      .getByRole('list', { name: 'Latest ritual traces' })
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
    await page.route('https://telegram.org/js/telegram-web-app.js', (route) =>
      route.abort()
    );

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

  test('heart keeps the 5s heartbeat, hover glow and reduced-motion opt out', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const heartLink = page.getByRole('link', { name: /Light the Vigil heart/ });
    const pulse = page.getByTestId('temple-heart-pulse');

    const animation = () =>
      pulse.evaluate((element) => {
        const computed = window.getComputedStyle(element);

        return {
          name: computed.animationName,
          duration: computed.animationDuration,
        };
      });

    await expect.poll(animation).toMatchObject({
      name: expect.stringContaining('temple-heartbeat'),
      duration: '5s',
    });

    await heartLink.hover();
    await page.waitForTimeout(300);

    expect(
      await pulse.evaluate((element) => getComputedStyle(element).boxShadow)
    ).toContain('rgba(200, 32, 43, 0.5)');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect
      .poll(async () => (await animation()).name)
      .toBe('none');
  });

  test('anonymous heart tap enters the Vigil without claiming a spark', async ({
    page,
  }) => {
    let claimRequests = 0;

    await page.route('**/api/vigil/claim*', async (route) => {
      claimRequests += 1;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'not authenticated' }),
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const heartLink = page.getByRole('link', { name: /Light the Vigil heart/ });

    await expect(heartLink).toHaveAttribute('href', '/vigil');
    await expect(heartLink).toHaveAttribute('data-heart-auth', 'anonymous');
    await expect(page.getByText('12 supporters')).toHaveAttribute(
      'data-supporter-count',
      '12'
    );

    await heartLink.click();
    await page.waitForURL('**/vigil');

    expect(claimRequests).toBe(0);
  });

  test('authenticated single tap lights the shared heart without leaving the home', async ({
    page,
  }) => {
    let claimRequests = 0;

    await page.addInitScript(() => {
      (window as unknown as { Telegram?: unknown }).Telegram = {
        WebApp: {
          initData: 'audit-init-data',
          platform: 'ios',
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

    await page.route('**/api/temple/auth', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          displayName: 'Anna',
          source: 'telegram',
        }),
      });
    });

    await page.route('**/api/vigil/claim*', async (route) => {
      if (route.request().method() === 'POST') {
        claimRequests += 1;

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            record: { id: 1 },
            cooldown: { remainingMs: 86_400_000, remainingLabel: '24h' },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, remainingMs: 0 }),
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const heart = page.getByRole('link', { name: /Light the Vigil heart/ });

    await expect(heart).toHaveAttribute('data-heart-auth', 'authenticated');
    await heart.click();

    await expect(
      page.getByTestId('temple-heart-spark-status')
    ).toContainText(/added to the shared heart/i);
    expect(claimRequests).toBe(1);
    await expect(page).toHaveURL(/\/temple$/);
  });

  test('authenticated hold sends a spark only after the server confirms it', async ({
    page,
  }) => {
    let claimRequests = 0;

    await page.addInitScript(() => {
      (window as unknown as { Telegram?: unknown }).Telegram = {
        WebApp: {
          initData: 'audit-init-data',
          platform: 'ios',
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

    await page.route('**/api/temple/auth', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          displayName: 'Anna',
          source: 'telegram',
        }),
      });
    });

    await page.route('**/api/vigil/claim*', async (route) => {
      if (route.request().method() === 'POST') {
        claimRequests += 1;

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            record: { id: 1 },
            cooldown: { remainingMs: 86_400_000, remainingLabel: '24h' },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true }),
      });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const heart = page.getByRole('link', { name: /Light the Vigil heart/ });

    await expect(heart).toHaveAttribute('data-heart-auth', 'authenticated');

    await heart.hover();
    await page.mouse.down();
    await page.waitForTimeout(750);
    await page.mouse.up();

    await expect(
      page.getByTestId('temple-heart-spark-status')
    ).toContainText(/Spark received/i);
    expect(claimRequests).toBe(1);
    await expect(page).toHaveURL(/\/temple$/);
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

  test('ritual grid is 4 columns on desktop, 2 on tablet and 1 on mobile', async ({
    page,
  }) => {
    const layouts = [
      { label: 'desktop-min', width: 1024, height: 768, columns: 4 },
      { label: 'desktop', width: 1440, height: 900, columns: 4 },
      { label: 'tablet', width: 768, height: 1024, columns: 2 },
      { label: 'mobile', width: 390, height: 844, columns: 1 },
      { label: 'mobile-narrow', width: 320, height: 568, columns: 1 },
    ] as const;

    for (const layout of layouts) {
      await page.setViewportSize({
        width: layout.width,
        height: layout.height,
      });
      await openTemple(page);

      const cards = page.locator(
        'section[aria-labelledby="rituals-title"] a'
      );

      await expect(cards).toHaveCount(4);

      const metrics = await cards.evaluateAll((elements) =>
        elements.map((element) => {
          const card = element as HTMLElement;
          const body = card.children[1] as HTMLElement;
          const label = body.children[0] as HTMLElement;
          const hint = body.children[1] as HTMLElement;
          const rect = card.getBoundingClientRect();

          return {
            top: rect.top,
            width: rect.width,
            height: rect.height,
            label: {
              text: label.textContent,
              scrollWidth: label.scrollWidth,
              clientWidth: label.clientWidth,
              scrollHeight: label.scrollHeight,
              clientHeight: label.clientHeight,
            },
            hint: {
              text: hint.textContent,
              scrollWidth: hint.scrollWidth,
              clientWidth: hint.clientWidth,
              scrollHeight: hint.scrollHeight,
              clientHeight: hint.clientHeight,
            },
          };
        })
      );

      const rows = Array.from(
        metrics.reduce((grouped, card) => {
          const key = Math.round(card.top);

          grouped.set(key, [...(grouped.get(key) ?? []), card]);

          return grouped;
        }, new Map<number, typeof metrics>())
      );

      expect(
        rows.map(([, row]) => row.length),
        `${layout.label} should use ${layout.columns} equal columns`
      ).toEqual(
        Array.from({ length: 4 / layout.columns }, () => layout.columns)
      );

      for (const [, row] of rows) {
        const heights = row.map((card) => card.height);

        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(
          1
        );
      }

      for (const card of metrics) {
        expect(card.width).toBeGreaterThanOrEqual(44);
        expect(card.height).toBeGreaterThanOrEqual(44);

        for (const text of [card.label, card.hint]) {
          expect(
            text.scrollWidth,
            `${layout.label} "${text.text}" should not be clipped`
          ).toBeLessThanOrEqual(text.clientWidth + 1);
          expect(
            text.scrollHeight,
            `${layout.label} "${text.text}" should not be clipped vertically`
          ).toBeLessThanOrEqual(text.clientHeight + 1);
        }
      }

      await expectNoHorizontalOverflow(page);
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

    await page.getByRole('button', { name: /Support the Temple with \$5/ }).click();

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

    await page.getByRole('button', { name: /Support the Temple with \$20/ }).click();
    await page.waitForURL('https://checkout.stripe.com/**');

    expect(checkoutBodies).toHaveLength(1);
    expect(checkoutBodies[0]).toMatchObject({ amount: 20, currency: 'usd' });
  });
});

// ---------------------------------------------------------------------------
// Reference reveal, focus and reduced-motion checks
// ---------------------------------------------------------------------------

async function overlayVars(modal: ReturnType<Page['getByTestId']>) {
  return modal.evaluate((element) => ({
    x: element.style.getPropertyValue('--x'),
    y: element.style.getPropertyValue('--y'),
    color: element.style.getPropertyValue('--c'),
    state: element.getAttribute('data-state'),
  }));
}

test.describe('Temple ritual modal reveal', () => {
  test('opens from the ritual-card centre, focuses ← Temple, locks scroll and closes back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const card = page.getByRole('link', { name: 'Calm' });

    await card.scrollIntoViewIfNeeded();
    await card.hover();
    await page.waitForTimeout(400);

    const box = await card.boundingBox();

    expect(box).not.toBeNull();

    await card.click();

    const modal = page.getByTestId('temple-modal');

    await expect(modal).toHaveAttribute('data-state', 'open');

    const vars = await overlayVars(modal);

    expect(parseFloat(vars.x)).toBeCloseTo(box!.x + box!.width / 2, 0);
    expect(parseFloat(vars.y)).toBeCloseTo(box!.y + box!.height / 2, 0);
    expect(vars.color).toBe('#5d7f9b');

    await expect(
      page.getByRole('button', { name: '← Temple' })
    ).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
      .toBe('hidden');

    await page.keyboard.press('Escape');

    await expect(modal).toHaveAttribute('data-state', 'closed');
    await expect(page).toHaveURL(/\/temple$/);
    await expect(card).toBeFocused();
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
      .not.toBe('hidden');
  });

  test('opens the heart modal from the heart centre with the Vigil accent', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const heart = page.getByRole('link', { name: /Light the Vigil heart/ });

    await heart.scrollIntoViewIfNeeded();

    const box = await heart.boundingBox();

    expect(box).not.toBeNull();

    await heart.click();

    const modal = page.getByTestId('temple-modal');

    await expect(modal).toHaveAttribute('data-state', 'open');

    const vars = await overlayVars(modal);

    expect(parseFloat(vars.x)).toBeCloseTo(box!.x + box!.width / 2, 0);
    expect(parseFloat(vars.y)).toBeCloseTo(box!.y + box!.height / 2, 0);
    expect(vars.color).toBe('#c8202b');

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/temple$/);
  });

  test('keeps the 5s home heartbeat and the 10s modal Inhale/Exhale cycle', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    const pulse = page.getByTestId('temple-heart-pulse');
    const heartbeat = await pulse.evaluate((element) => {
      const computed = getComputedStyle(element);

      return {
        name: computed.animationName,
        duration: computed.animationDuration,
        easing: computed.animationTimingFunction,
        iteration: computed.animationIterationCount,
      };
    });

    expect(heartbeat.name).toContain('temple-heartbeat');
    expect(heartbeat.duration).toBe('5s');
    expect(heartbeat.easing).toBe('ease-in-out');
    expect(heartbeat.iteration).toBe('infinite');

    const heart = page.getByRole('link', { name: /Light the Vigil heart/ });

    await heart.scrollIntoViewIfNeeded();
    await heart.click();

    const modalHeart = page.getByTestId('vigil-heart');

    await expect(modalHeart).toHaveAttribute('data-breathing-phase', 'Inhale');
    await expect(page.getByTestId('vigil-heart-breath-label')).toHaveText(
      'Inhale'
    );

    const breathing = await modalHeart.evaluate((element) => {
      const computed = getComputedStyle(element);

      return {
        name: computed.animationName,
        duration: computed.animationDuration,
      };
    });

    expect(breathing.name).toContain('temple-heart-breathing');
    expect(breathing.duration).toBe('10s');

    await page.waitForTimeout(4_200);

    await expect(modalHeart).toHaveAttribute('data-breathing-phase', 'Exhale');
    await expect(page.getByTestId('vigil-heart-breath-label')).toHaveText(
      'Exhale'
    );
  });

  test('prefers-reduced-motion disables the reveal transition', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);

    await page.getByRole('link', { name: 'Calm' }).click();

    const modal = page.getByTestId('temple-modal');

    await expect(modal).toHaveAttribute('data-state', 'open');

    const transition = await modal.evaluate((element) => {
      const computed = getComputedStyle(element);

      return {
        duration: computed.transitionDuration,
        property: computed.transitionProperty,
      };
    });

    expect(transition.duration).toBe('0s');
    expect(transition.property).toBe('none');
  });
});

test.describe('Temple reference screenshots', () => {
  test('captures the open Calm ritual modal after its reveal', async ({
    page,
  }) => {
    const outputDir = path.resolve(
      process.cwd(),
      'test-results/temple-reference'
    );

    fs.mkdirSync(outputDir, { recursive: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await openTemple(page);
    await page.getByRole('link', { name: 'Calm' }).click();
    await expect(page.getByTestId('temple-modal')).toHaveAttribute(
      'data-state',
      'open'
    );
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.join(outputDir, 'modal-calm-light-desktop.png'),
    });
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`captures the Temple in ${scheme} theme at 1440 and 390`, async ({
      page,
    }) => {
      const outputDir = path.resolve(
        process.cwd(),
        'test-results/temple-reference'
      );

      fs.mkdirSync(outputDir, { recursive: true });

      await page.emulateMedia({ colorScheme: scheme });

      await page.setViewportSize({ width: 1440, height: 900 });
      await openTemple(page);
      await page.getByTestId('temple-center-scroll').evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.waitForTimeout(250);
      await page.screenshot({
        path: path.join(outputDir, `temple-${scheme}-desktop.png`),
      });

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await openTemple(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      await page.screenshot({
        path: path.join(outputDir, `temple-${scheme}-mobile-390.png`),
        fullPage: true,
      });
    });
  }
});
