import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page, type Locator } from '@playwright/test';

const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts/telegram-navigation');

const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;

async function installTelegram(page: Page) {
  await page.addInitScript(
    ({ safeTop, safeBottom }) => {
      const webApp = {
        initData: 'query_id=nav-test&user=%7B%22id%22%3A1%7D&auth_date=1&hash=test',
        platform: 'ios',
        version: '8.0',
        viewportHeight: window.innerHeight,
        viewportStableHeight: window.innerHeight,
        safeAreaInset: { top: safeTop, right: 0, bottom: safeBottom, left: 0 },
        contentSafeAreaInset: { top: safeTop, right: 0, bottom: safeBottom, left: 0 },
        isExpanded: true,
        isFullscreen: false,
        ready() {},
        expand() {},
        close() {},
        disableVerticalSwipes() {},
        setHeaderColor() {},
        setBackgroundColor() {},
        setBottomBarColor() {},
        onEvent() {},
        offEvent() {},
        HapticFeedback: {
          impactOccurred() {},
          notificationOccurred() {},
          selectionChanged() {},
        },
        BackButton: {
          show() {},
          hide() {},
          onClick(handler: () => void) {
            (window as unknown as { __tgBack?: () => void }).__tgBack = handler;
          },
          offClick() {},
        },
      };

      (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: webApp };
    },
    { safeTop: SAFE_TOP, safeBottom: SAFE_BOTTOM }
  );
}

const FLOW_ITEMS = {
  items: [
    {
      id: 'nav-flow-1',
      title: 'The quiet index',
      slug: 'the-quiet-index',
      lang: 'en',
      type: 'note',
      contentType: 'note',
      status: 'published',
      visibility: 'public',
      showTitle: true,
      bodyText:
        'A publication is a way of deciding what deserves to stay in view. This entry belongs to the Flow index.',
      bodyExcerpt:
        'A publication is a way of deciding what deserves to stay in view. This entry belongs to the Flow index.',
      published_at: '2026-11-24T12:00:00.000Z',
    },
    {
      id: 'nav-flow-2',
      title: 'Notes from the archive',
      slug: 'notes-from-the-archive',
      lang: 'en',
      type: 'note',
      contentType: 'note',
      status: 'published',
      visibility: 'public',
      showTitle: true,
      bodyText:
        'Editorial rhythm, restrained type and a clear hierarchy. The archive keeps the same vocabulary.',
      bodyExcerpt:
        'Editorial rhythm, restrained type and a clear hierarchy. The archive keeps the same vocabulary.',
      published_at: '2026-11-23T12:00:00.000Z',
    },
  ],
  hasMore: false,
};

const TEMPLE_FEED = {
  ok: true,
  data: [
    {
      id: 'nav-trace-1',
      event_type: 'MEDITATION',
      canonical_type: 'MEDITATION',
      category: 'ritual',
      author: 'Pilgrim',
      message: 'Found calm.',
      created_at: '2026-11-24T12:00:00.000Z',
      audio_url: null,
    },
  ],
  stats: {
    completedRituals: 1,
    namedAuthors: 1,
    vigilSparks: 0,
    byType: { MEDITATION: 1 },
    windowDays: 30,
    windowStart: '2026-10-25T12:00:00.000Z',
    windowEnd: '2026-11-24T12:00:00.000Z',
    excluded: { infrastructure: 0, incomplete: 0 },
    truncated: false,
  },
  meta: {
    generatedAt: '2026-11-24T12:00:00.000Z',
    cachedAt: '2026-11-24T12:00:00.000Z',
    ttlSeconds: 60,
    traceLimit: 1,
    windowDays: 30,
    stale: false,
    cache: 'miss',
    truncated: false,
    definitions: {},
  },
  error: null,
};

async function mockFlowApis(page: Page) {
  await page.route('**/api/flow/items*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(FLOW_ITEMS),
    });
  });

  await page.route('**/api/admin/items/list*', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not allowed' }),
    });
  });
}

async function mockTempleApis(page: Page) {
  await page.route('**/api/temple_logs*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(TEMPLE_FEED),
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
        flameExpiresAt: new Date(Date.parse(lastLitAt) + 86_400_000).toISOString(),
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

async function openFlow(page: Page) {
  await installTelegram(page);
  await mockFlowApis(page);
  await page.goto('/flow');

  const trigger = page.getByRole('button', { name: 'Open Flow navigation' });
  await expect(trigger).toBeVisible();

  return trigger;
}

async function openTemple(page: Page) {
  await installTelegram(page);
  await mockTempleApis(page);
  await page.goto('/temple');

  const trigger = page.getByRole('button', { name: 'Open Temple navigation' });
  await expect(trigger).toBeVisible();

  return trigger;
}

async function expectTriggersSeparated(page: Page, viewportWidth: number) {
  const [pierrot, navigation] = await Promise.all([
    page.getByRole('button', { name: /^Open Pierrot/ }).boundingBox(),
    page.getByRole('button', { name: /^Open (Flow|Temple) navigation/ }).boundingBox(),
  ]);

  expect(pierrot).not.toBeNull();
  expect(navigation).not.toBeNull();

  expect(pierrot!.x + pierrot!.width).toBeLessThanOrEqual(navigation!.x - 8);
  expect(navigation!.x + navigation!.width).toBeLessThanOrEqual(viewportWidth + 1);
}

async function settleSheet(dialog: Locator) {
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished.catch(() => undefined))
    );
  });
}

async function expectPanelInsideSafeArea(
  page: Page,
  viewportWidth: number,
  viewportHeight: number
) {
  const box = await page.getByTestId('telegram-navigation-panel').boundingBox();

  expect(box).not.toBeNull();

  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.y).toBeGreaterThanOrEqual(SAFE_TOP - 1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth - 12 + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewportHeight - SAFE_BOTTOM - 12 + 1);
}

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test.describe('Telegram navigation — Flow', () => {
  test('390px: editorial sheet, safe area, no Temple rituals, keyboard and back', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const trigger = await openFlow(page);

    await expect(trigger).toHaveAttribute('data-nav-context', 'flow');
    await expectTriggersSeparated(page, 390);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-home-390x844-closed.png'),
    });

    await trigger.click();

    const dialog = page.getByTestId('telegram-navigation-panel');

    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-nav-context', 'flow');
    await expect(dialog.getByRole('link', { name: /Stream of thoughts & media/i })).toHaveAttribute(
      'href',
      '/flow'
    );
    await expect(dialog.getByRole('link', { name: /Stream of thoughts & media/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(dialog.getByRole('link', { name: /Editorial issues archive/i })).toHaveAttribute(
      'href',
      '/flow-issues'
    );
    await expect(dialog.getByRole('link', { name: /Calm/ })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: /Absolution/ })).toHaveCount(0);
    await expect(dialog.getByText('Rituals')).toHaveCount(0);
    await expect(dialog.getByText('Threshold')).toHaveCount(0);
    await expect(dialog.getByText('Where do you want to go?')).toHaveCount(0);

    await expect(dialog).toHaveCSS('background-color', 'rgb(255, 255, 255)');

    const box = await dialog.boundingBox();
    const triggerBox = await trigger.boundingBox();

    expect(box).not.toBeNull();
    expect(triggerBox).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(12);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390 - 12);
    expect(box!.y + box!.height).toBeLessThanOrEqual(triggerBox!.y - 4);
    expect(box!.y + box!.height).toBeLessThanOrEqual(844 - SAFE_BOTTOM - 12 + 1);

    await settleSheet(dialog);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-home-390x844-open.png'),
    });

    const close = dialog.getByRole('button', { name: 'Close navigation' });

    await expect(close).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Keyboard reopen and a real Telegram BackButton event.
    await trigger.press('Enter');
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __tgBack?: () => void }).__tgBack?.();
    });
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    // Backdrop dismissal.
    await trigger.click();
    await expect(dialog).toBeVisible();
    expect(await page.locator('body').evaluate((element) => element.style.overflow)).toBe('hidden');
    await page.locator('.telegram-nav-backdrop').click({ position: { x: 8, y: 8 } });
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    expect(await page.locator('body').evaluate((element) => element.style.overflow)).toBe('');
  });

  test('Flow detail route keeps the editorial index active', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);
    await mockFlowApis(page);

    await page.goto('/flow/the-quiet-index');

    await expect(page.getByRole('heading', { name: 'The quiet index', level: 1 })).toBeVisible();

    const trigger = page.getByRole('button', { name: 'Open Flow navigation' });

    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByTestId('telegram-navigation-panel');

    await expect(dialog.getByRole('link', { name: /Stream of thoughts & media/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(
      dialog.getByRole('link', { name: /Editorial issues archive/i })
    ).not.toHaveAttribute('aria-current');

    await settleSheet(dialog);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-detail-390x844-open.png'),
    });
  });

  test('820px: wider sheet remains separated and inside the expanded viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });

    const trigger = await openFlow(page);

    await expect(trigger).toHaveAttribute('data-nav-context', 'flow');
    await expect(trigger).toContainText('Flow');

    const pierrotBox = await page.getByRole('button', { name: /^Open Pierrot/ }).boundingBox();
    const navBox = await trigger.boundingBox();

    expect(pierrotBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(pierrotBox!.x + pierrotBox!.width).toBeLessThanOrEqual(navBox!.x - 8);
    expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(820 + 1);

    await trigger.click();

    const dialog = page.getByTestId('telegram-navigation-panel');

    await expect(dialog).toBeVisible();

    const box = await dialog.boundingBox();

    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(820 - 12 + 1);

    await settleSheet(dialog);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-home-820x1180-open.png'),
    });
  });

  test('reduced motion removes sheet animation and transitions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    const trigger = await openFlow(page);

    await expect(trigger).toHaveCSS('transition-duration', '0s');

    await trigger.click();

    const dialog = page.getByTestId('telegram-navigation-panel');

    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('animation-name', 'none');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-home-390x844-reduced-motion.png'),
    });
  });
});

test.describe('Telegram navigation — Temple', () => {
  test('390px: light architectural sheet with World, Temple and four rituals', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    const trigger = await openTemple(page);

    await expect(trigger).toHaveAttribute('data-nav-context', 'temple');
    await expectTriggersSeparated(page, 390);

    await trigger.click();

    const dialog = page.getByTestId('telegram-navigation-panel');

    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-nav-context', 'temple');

    const panelBackground = await dialog.evaluate(
      (element) => window.getComputedStyle(element).backgroundColor
    );

    expect(panelBackground).toMatch(/^rgba\(251, 248, 242/);

    await expect(dialog.getByRole('link', { name: /World/ })).toHaveAttribute(
      'href',
      '/heartandangel/world'
    );

    const templeLink = dialog.getByRole('link', { name: /Temple\s*The sanctuary/ });

    await expect(templeLink).toHaveAttribute('href', '/temple');
    await expect(templeLink).toHaveAttribute('aria-current', 'page');

    await expect(dialog.getByRole('link', { name: /^Calm/ })).toHaveAttribute(
      'href',
      '/heartandangel/calm'
    );
    await expect(dialog.getByRole('link', { name: /^Let It Go/ })).toHaveAttribute(
      'href',
      '/heartandangel/letitgo'
    );
    await expect(dialog.getByRole('link', { name: /^Absolution/ })).toHaveAttribute(
      'href',
      '/absolution'
    );
    await expect(dialog.getByRole('link', { name: /^Cast/ })).toHaveAttribute('href', '/cast');

    await expect(dialog.getByRole('link', { name: /Flow Issues/ })).toHaveCount(0);
    await expect(dialog.getByText('Threshold')).toHaveCount(0);
    await expect(dialog.getByText('Where do you want to go?')).toHaveCount(0);

    await settleSheet(dialog);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'temple-home-390x844-open.png'),
    });

    await expectPanelInsideSafeArea(page, 390, 844);
  });

  test('nested World route marks World active', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);

    await page.goto('/heartandangel/world');

    const trigger = page.getByRole('button', { name: 'Open Temple navigation' });

    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByTestId('telegram-navigation-panel');

    await expect(dialog.getByRole('link', { name: /World/ })).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(dialog.getByRole('link', { name: /Temple\s*The sanctuary/ })).not.toHaveAttribute(
      'aria-current'
    );

    await settleSheet(dialog);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'temple-world-390x844-open.png'),
    });
  });

  test('ritual routes keep their own chrome and do not receive the floating trigger', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);

    await page.goto('/heartandangel/calm');

    await expect(page.getByRole('button', { name: 'Open Temple navigation' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open Flow navigation' })).toHaveCount(0);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'temple-ritual-route-390x844.png'),
    });
  });
});
