import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts/flow-telegram-reader');

const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;

const FEED_ITEMS = [
  {
    id: 'reader-flow-1',
    title: 'The quiet index',
    slug: 'the-quiet-index',
    lang: 'en',
    type: 'note',
    contentType: 'note',
    status: 'published',
    visibility: 'public',
    showTitle: true,
    bodyText: 'A publication is a way of deciding what deserves to stay in view.',
    bodyExcerpt: 'A publication is a way of deciding what deserves to stay in view.',
    published_at: '2026-11-24T12:00:00.000Z',
  },
  {
    id: 'reader-flow-2',
    title: 'Two rooms, one light',
    slug: 'reader-with-images',
    lang: 'en',
    type: 'article',
    contentType: 'article',
    status: 'published',
    visibility: 'public',
    showTitle: true,
    bodyText:
      'The first room is empty on purpose. Morning arrives through the tall window and lands on the floor as a pale rectangle.',
    bodyExcerpt:
      'The first room is empty on purpose. Morning arrives through the tall window and lands on the floor as a pale rectangle.',
    published_at: '2026-11-22T09:30:00.000Z',
  },
  ...Array.from({ length: 12 }, (_, index) => ({
    id: `reader-flow-${index + 3}`,
    title: `Archive note ${index + 1}`,
    slug: `archive-note-${index + 1}`,
    lang: 'en',
    type: 'note',
    contentType: 'note',
    status: 'published',
    visibility: 'public',
    showTitle: true,
    bodyText:
      'Editorial rhythm, restrained type and a clear hierarchy. The archive keeps the same vocabulary for every entry.',
    bodyExcerpt:
      'Editorial rhythm, restrained type and a clear hierarchy. The archive keeps the same vocabulary for every entry.',
    published_at: new Date(Date.UTC(2026, 10, 20 - index, 12)).toISOString(),
  })),
];

async function installTelegram(page: Page) {
  // The test supplies a deterministic WebApp mock. Aborting the remote SDK
  // keeps the browser/CI run offline and prevents the real script from
  // replacing the mock in a document without Telegram launch parameters.
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.abort());

  await page.addInitScript(
    ({ safeTop, safeBottom }) => {
      const handlers = new Map<string, () => void>();
      const backHandlers: Array<() => void> = [];

      const webApp = {
        initData: 'query_id=reader-test&user=%7B%22id%22%3A1%7D&auth_date=1&hash=test',
        platform: 'ios',
        version: '8.0',
        viewportHeight: window.innerHeight,
        viewportStableHeight: window.innerHeight,
        safeAreaInset: { top: safeTop, right: 0, bottom: safeBottom, left: 0 },
        contentSafeAreaInset: { top: safeTop, right: 0, bottom: safeBottom, left: 0 },
        isExpanded: true,
        isFullscreen: false,
        colorScheme: 'light',
        themeParams: {
          bg_color: '#ffffff',
          text_color: '#1d1b18',
          header_bg_color: '#f6f1e8',
        },
        ready() {},
        expand() {},
        requestFullscreen() {
          this.isFullscreen = true;
          handlers.get('fullscreenChanged')?.();
        },
        exitFullscreen() {
          this.isFullscreen = false;
          handlers.get('fullscreenChanged')?.();
        },
        disableVerticalSwipes() {},
        enableVerticalSwipes() {},
        close() {},
        setHeaderColor() {},
        setBackgroundColor() {},
        setBottomBarColor() {},
        onEvent(event: string, handler: () => void) {
          handlers.set(event, handler);
        },
        offEvent(event: string) {
          handlers.delete(event);
        },
        HapticFeedback: {
          impactOccurred() {},
          notificationOccurred() {},
          selectionChanged() {},
        },
        BackButton: {
          show() {},
          hide() {},
          onClick(handler: () => void) {
            backHandlers.push(handler);
          },
          offClick(handler: () => void) {
            const index = backHandlers.lastIndexOf(handler);
            if (index >= 0) backHandlers.splice(index, 1);
          },
        },
        shareToStory(mediaUrl: string, params: unknown) {
          (window as unknown as { __flowStory?: unknown }).__flowStory = { mediaUrl, params };
        },
        shareMessage() {},
        checkHomeScreenStatus(callback?: (status: string) => void) {
          callback?.('promptable');
        },
        addToHomeScreen(callback?: (status: string) => void) {
          (window as unknown as { __flowHomeScreen?: boolean }).__flowHomeScreen = true;
          callback?.('added');
        },
      };

      (window as unknown as { __tgBack?: () => void }).__tgBack = () => {
        backHandlers[backHandlers.length - 1]?.();
      };

      (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: webApp };
    },
    { safeTop: SAFE_TOP, safeBottom: SAFE_BOTTOM }
  );
}

async function mockFlowApis(page: Page) {
  await page.route('**/api/flow/items*', async (route) => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get('limit') || '10');
    const offset = Number(url.searchParams.get('offset') || '0');
    const items = FEED_ITEMS.slice(offset, offset + limit);

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items,
        hasMore: offset + items.length < FEED_ITEMS.length,
      }),
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

async function mockImages(page: Page) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <rect width="1200" height="900" fill="#e8e2d8"/>
      <rect x="90" y="120" width="520" height="700" fill="#f4efe6"/>
      <path d="M640 120 L1110 120 L1110 820 Z" fill="#c8beb0"/>
      <circle cx="760" cy="260" r="70" fill="#f7f2e9" opacity="0.8"/>
    </svg>
  `;

  await page.route('**/images.flow.test/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: svg,
    });
  });
}

test.beforeAll(() => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test.describe('Flow reader — Telegram', () => {
  test('390px: editorial feed, focused reader, progress and gallery viewer', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);
    await mockFlowApis(page);
    await mockImages(page);

    await page.goto('/flow');

    await expect(page.getByRole('link', { name: 'Two rooms, one light' })).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/telegram-app/);
    await expect(page.locator('body')).toHaveClass(/telegram-fullscreen-close/);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-feed-390x844.png'),
    });

    await page.getByRole('link', { name: 'Two rooms, one light' }).first().click();

    await expect(
      page.getByRole('heading', { name: 'Two rooms, one light', level: 1 })
    ).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-reader-390x844.png'),
    });

    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 1.4, behavior: 'auto' }));
    await page.waitForTimeout(250);

    const progress = page.getByRole('progressbar', { name: 'Reading progress' });

    await expect(progress).toBeVisible();
    await expect(progress).toHaveAttribute('aria-valuenow', /\d+/);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-reader-progress-390x844.png'),
    });

    const firstImage = page.getByRole('link', { name: /Open image: First light/ });

    await firstImage.click();

    const viewer = page.getByRole('dialog', { name: 'Image viewer' });

    await expect(viewer).toBeVisible();
    await expect(page.getByText('1 / 2')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-image-viewer-390x844.png'),
    });

    expect(await page.locator('body').evaluate((element) => element.style.overflow)).toBe('hidden');

    await viewer.getByRole('button', { name: 'Next image' }).click();
    await expect(page.getByText('2 / 2')).toBeVisible();
    await expect(viewer.getByText('The archive, late morning')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-image-viewer-second-390x844.png'),
    });

    await page.evaluate(() => {
      (window as unknown as { __tgBack?: () => void }).__tgBack?.();
    });

    await expect(viewer).toHaveCount(0);
    expect(await page.locator('body').evaluate((element) => element.style.overflow)).toBe('');

    // Story is offered as a separate, contextual action.
    const story = page.getByRole('button', {
      name: 'Share this Flow post to a Telegram Story',
    });

    await expect(story).toBeVisible();
    await story.click();

    expect(
      await page.evaluate(() =>
        Boolean((window as unknown as { __flowStory?: unknown }).__flowStory)
      )
    ).toBe(true);
  });

  test('820px iPad: reader and viewer stay composed in a wide Telegram viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 1180 });
    await installTelegram(page);
    await mockFlowApis(page);
    await mockImages(page);

    await page.goto('/flow/reader-with-images');

    await expect(
      page.getByRole('heading', { name: 'Two rooms, one light', level: 1 })
    ).toBeVisible();
    await expect(page.locator('body')).toHaveClass(/telegram-app/);
    await expect(page.locator('body')).toHaveClass(/telegram-fullscreen-close/);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-reader-820x1180.png'),
    });

    await page.getByRole('link', { name: /Open image: First light/ }).click();
    await expect(page.getByRole('dialog', { name: 'Image viewer' })).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-image-viewer-820x1180.png'),
    });
  });

  test('browser fallback keeps the reader, viewer and progress line without Telegram classes', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockFlowApis(page);
    await mockImages(page);

    await page.goto('/flow/reader-with-images');

    await expect(
      page.getByRole('heading', { name: 'Two rooms, one light', level: 1 })
    ).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/telegram-app/);
    await expect(page.getByRole('progressbar', { name: 'Reading progress' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open Flow navigation' })).toHaveCount(0);

    await page.getByRole('link', { name: /Open image: First light/ }).click();
    await expect(page.getByRole('dialog', { name: 'Image viewer' })).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'flow-reader-browser-fallback-390x844.png'),
    });
  });

  test('browser reading controls persist appearance, expose contents and keep vertical reading intact', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockFlowApis(page);
    await mockImages(page);

    await page.goto('/flow/reader-with-images');

    await expect(
      page.getByRole('heading', { name: 'Two rooms, one light', level: 1 })
    ).toBeVisible();

    const appearance = page.getByRole('button', { name: 'Appearance settings' });

    await expect(appearance).toBeVisible();
    await expect(page.getByRole('button', { name: 'Contents' })).toBeVisible();

    // Controls sit above the publication text in normal flow, not over it.
    const controlBox = await page.locator('.flow-reader__controls').boundingBox();
    const contentBox = await page.locator('.flow-reader__meta').boundingBox();

    expect(controlBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(contentBox!.y + 1);

    await appearance.click();

    const settings = page.getByRole('dialog', { name: 'Appearance' });

    await settings.getByRole('button', { name: 'Increase text size' }).click();
    await expect(settings.getByText('110%')).toBeVisible();

    await settings.getByRole('button', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-flow-reader-theme', 'dark');
    await expect(page.locator('.flow-post-page--reader')).toHaveCSS(
      'background-color',
      'rgb(18, 18, 18)'
    );

    const stored = await page.evaluate(() => window.localStorage.getItem('flow_reader_prefs_v1'));

    expect(stored).toContain('"fontScale":1.1');
    expect(stored).toContain('"theme":"dark"');
    expect(stored).not.toMatch(/initData|telegram|user_id|token/i);

    await page.keyboard.press('Escape');
    await expect(settings).toHaveCount(0);

    await page.reload();
    await page.getByRole('button', { name: 'Appearance settings' }).click();
    await expect(page.getByRole('dialog', { name: 'Appearance' }).getByText('110%')).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Contents' }).click();

    const toc = page.getByRole('navigation', { name: 'Table of contents' });

    await expect(toc.getByRole('button', { name: 'A room with one light' })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Focus mode' }).click();
    await expect(page.locator('body')).toHaveClass(/flow-reader-focus/);
    await expect(page.locator('.flow-reader__meta')).toBeHidden();

    // Text selection remains a normal vertical document selection.
    const selection = await page.evaluate(() => {
      const paragraph = document.querySelector('.flow-item p');
      const range = document.createRange();

      if (!paragraph) return '';

      range.selectNodeContents(paragraph);

      const current = window.getSelection();

      current?.removeAllRanges();
      current?.addRange(range);

      return current?.toString() ?? '';
    });

    expect(selection.length).toBeGreaterThan(20);

    expect(
      await page.evaluate(() => {
        const article = document.querySelector('.flow-item');

        return article ? getComputedStyle(article).userSelect : 'none';
      })
    ).not.toBe('none');

    // Browser text zoom / Dynamic Type must not create horizontal pagination.
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true);
  });

  test('1280px desktop reading controls stay outside the text measure', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockFlowApis(page);
    await mockImages(page);

    await page.goto('/flow/reader-with-images');

    await expect(page.getByRole('button', { name: 'Appearance settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Contents' })).toBeVisible();

    const controlBox = await page.locator('.flow-reader__controls').boundingBox();
    const contentBox = await page.locator('.flow-reader__meta').boundingBox();

    expect(controlBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(controlBox!.y + controlBox!.height).toBeLessThanOrEqual(contentBox!.y + 1);

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    ).toBe(true);
  });

  test('reduced motion keeps reader controls still', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockFlowApis(page);
    await mockImages(page);

    await page.goto('/flow/reader-with-images');

    expect(
      await page.evaluate(() => {
        const article = document.querySelector('.flow-item');

        return article ? getComputedStyle(article).animationName : 'missing';
      })
    ).toBe('none');

    await page.getByRole('button', { name: 'Appearance settings' }).click();
    await expect(page.getByRole('dialog', { name: 'Appearance' })).toBeVisible();

    expect(
      await page.evaluate(() => {
        const panel = document.querySelector('.flow-reader-dialog__panel');

        return panel ? getComputedStyle(panel).animationName : 'missing';
      })
    ).toBe('none');
  });

  test('restores the feed from a stable entry anchor after a reload', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);
    await mockFlowApis(page);
    await mockImages(page);

    await page.goto('/flow');
    await expect(page.getByRole('link', { name: 'Two rooms, one light' })).toBeVisible();

    await page.evaluate(() => {
      const entry = document.querySelectorAll('[data-flow-entry-id]')[5];

      entry?.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(300);
    // A second, tiny scroll guarantees the throttled feed writer runs even if
    // an earlier viewport event consumed the first frame.
    await page.evaluate(() => window.scrollBy(0, 24));
    await page.waitForTimeout(120);

    const saved = await page.evaluate(() => {
      const raw = window.sessionStorage.getItem('flow_feed_state_v1');

      return raw ? (JSON.parse(raw) as { anchorId?: string }) : null;
    });

    expect(saved?.anchorId).toBeTruthy();

    await page.reload();
    await expect(page.getByRole('link', { name: 'Two rooms, one light' })).toBeVisible();

    // Restoration may wait for image boxes and a second animation frame.
    await expect
      .poll(() => page.evaluate(() => window.scrollY), { timeout: 3_000 })
      .toBeGreaterThan(120);
  });
});
