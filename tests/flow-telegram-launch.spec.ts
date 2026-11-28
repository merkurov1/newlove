import { test, expect, type Page } from '@playwright/test';

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js';
const LAUNCH_HASH =
  '#tgWebAppData=query_id%3Dlaunch-test%26user%3D%257B%2522id%2522%253A1%257D%26auth_date%3D1%26hash%3Dtest&tgWebAppVersion=8.0&tgWebAppPlatform=ios';

const SDK_STUB = `
  (() => {
    const calls = [];
    window.__tgCalls = calls;
    const handlers = new Map();
    const back = [];
    const webApp = {
      initData: 'query_id=launch-test&user=%7B%22id%22%3A1%7D&auth_date=1&hash=test',
      platform: 'ios',
      version: '8.0',
      viewportHeight: window.innerHeight,
      viewportStableHeight: window.innerHeight,
      safeAreaInset: { top: 47, right: 0, bottom: 34, left: 0 },
      contentSafeAreaInset: { top: 47, right: 0, bottom: 34, left: 0 },
      isExpanded: true,
      isFullscreen: false,
      colorScheme: 'light',
      themeParams: { bg_color: '#ffffff', text_color: '#1d1b18' },
      ready() { calls.push('ready'); },
      expand() { calls.push('expand'); },
      requestFullscreen() {
        calls.push('requestFullscreen');
        this.isFullscreen = true;
        handlers.get('fullscreenChanged')?.();
      },
      exitFullscreen() {
        calls.push('exitFullscreen');
        this.isFullscreen = false;
        handlers.get('fullscreenChanged')?.();
      },
      disableVerticalSwipes() { calls.push('disableVerticalSwipes'); },
      enableVerticalSwipes() { calls.push('enableVerticalSwipes'); },
      close() { calls.push('close'); },
      setHeaderColor() {},
      setBackgroundColor() {},
      setBottomBarColor() {},
      onEvent(event, handler) { handlers.set(event, handler); },
      offEvent(event) { handlers.delete(event); },
      HapticFeedback: {
        impactOccurred() {},
        notificationOccurred() {},
        selectionChanged() {},
      },
      BackButton: {
        show() { calls.push('back.show'); },
        hide() { calls.push('back.hide'); },
        onClick(handler) { back.push(handler); },
        offClick(handler) {
          const index = back.lastIndexOf(handler);
          if (index >= 0) back.splice(index, 1);
        },
      },
    };

    window.__tgBack = () => back[back.length - 1]?.();
    window.Telegram = { WebApp: webApp };
  })();
`;

type LaunchWindow = Window & {
  __tgCalls?: string[];
  __tgBack?: () => void;
};

async function installTelegramSdk(page: Page) {
  const requests: string[] = [];

  await page.route(SDK_URL, async (route) => {
    requests.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: SDK_STUB,
    });
  });

  return requests;
}

async function mockFlowApis(page: Page) {
  await page.route('**/api/flow/items*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], hasMore: false }),
    });
  });

  await page.route('**/api/admin/items/list*', async (route) => {
    await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
  });
}

async function telegramCalls(page: Page) {
  return page.evaluate(() => (window as LaunchWindow).__tgCalls ?? []);
}

async function expectPathname(page: Page, pathname: string) {
  await expect.poll(() => page.evaluate(() => window.location.pathname)).toBe(pathname);
}

test('cold Main Mini App launch loads the SDK early and resolves start_param', async ({ page }) => {
  const sdkRequests = await installTelegramSdk(page);
  await mockFlowApis(page);

  await page.goto(`/lobby${LAUNCH_HASH}&tgWebAppStartParam=flow`);

  await expectPathname(page, '/flow');
  await expect(page.locator('body')).toHaveClass(/telegram-app/);
  await expect(page.locator('html')).toHaveClass(/telegram-mini-app/);

  await expect.poll(async () => (await telegramCalls(page)).includes('ready')).toBe(true);
  await expect.poll(async () => (await telegramCalls(page)).includes('expand')).toBe(true);
  await expect
    .poll(async () => (await telegramCalls(page)).includes('requestFullscreen'))
    .toBe(true);

  const safeTop = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--tg-safe-area-top').trim()
  );

  expect(safeTop).toBe('47px');
  expect(sdkRequests).toHaveLength(1);
  await expect(
    page.locator('link[rel="canonical"][href="https://www.merkurov.love/flow"]')
  ).toHaveCount(1);
});

test('repeat launch stays on Flow and reuses the canonical route', async ({ page }) => {
  const sdkRequests = await installTelegramSdk(page);
  await mockFlowApis(page);

  await page.goto(`/flow${LAUNCH_HASH}`);
  await expectPathname(page, '/flow');
  await expect.poll(async () => (await telegramCalls(page)).includes('ready')).toBe(true);

  await page.reload();
  await expectPathname(page, '/flow');
  await expect.poll(async () => (await telegramCalls(page)).includes('ready')).toBe(true);

  expect(sdkRequests.length).toBeGreaterThanOrEqual(1);
});

test('Flow sub-route deep link opens and Back returns to Flow home', async ({ page }) => {
  await installTelegramSdk(page);
  await mockFlowApis(page);

  await page.goto(`/lobby${LAUNCH_HASH}&tgWebAppStartParam=flow__am9pbg`);

  await expectPathname(page, '/flow/join');
  await expect(page.locator('body')).toHaveClass(/telegram-app/);
  await expect.poll(async () => (await telegramCalls(page)).includes('back.show')).toBe(true);

  await page.evaluate(() => (window as LaunchWindow).__tgBack?.());

  await expectPathname(page, '/flow');
});

test('Back at a cold root closes the Mini App instead of leaving a blank page', async ({
  page,
}) => {
  await installTelegramSdk(page);
  await mockFlowApis(page);

  await page.goto(`/lobby${LAUNCH_HASH}`);
  await expectPathname(page, '/lobby');
  await expect(page.locator('body')).toHaveClass(/telegram-app/);
  await expect.poll(async () => (await telegramCalls(page)).includes('back.show')).toBe(true);

  await page.evaluate(() => (window as LaunchWindow).__tgBack?.());

  await expect.poll(async () => (await telegramCalls(page)).includes('close')).toBe(true);
  await expectPathname(page, '/lobby');
});

test('ordinary browser keeps Flow and never requests the Telegram SDK', async ({ page }) => {
  const sdkRequests = await installTelegramSdk(page);
  await mockFlowApis(page);

  await page.goto('/flow');
  await expect(page.locator('.flow-page__title')).toHaveText('Flow');
  await expect(page.locator('header.site-header')).toBeVisible();

  await page.waitForTimeout(700);

  expect(sdkRequests).toHaveLength(0);
  await expect(page.locator('body')).not.toHaveClass(/telegram-app/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://www.merkurov.love/flow'
  );
});

test('Flow loading and error states remain visible inside the Mini App shell', async ({ page }) => {
  await installTelegramSdk(page);

  await page.route('**/api/flow/items*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Temporary failure' }),
    });
  });

  await page.route('**/api/admin/items/list*', async (route) => {
    await route.fulfill({ status: 403, contentType: 'application/json', body: '{}' });
  });

  await page.goto(`/flow${LAUNCH_HASH}`);

  await expect(page.getByLabel('Loading Flow')).toBeVisible();
  await expect(page.getByText('Could not load Flow.', { exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});
