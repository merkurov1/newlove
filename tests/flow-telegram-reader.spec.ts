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

type Rect = { x: number; y: number; width: number; height: number };

type ViewerGeometry = {
  viewport: { width: number; height: number };
  viewer: Rect;
  stage: Rect;
  image: Rect & {
    centerX: number;
    centerY: number;
    naturalWidth: number;
    naturalHeight: number;
  };
  caption: Rect | null;
  background: string;
  articleTransform: string | null;
  parentIsBody: boolean;
  horizontalOverflow: number;
};

async function readViewerGeometry(page: Page): Promise<ViewerGeometry> {
  return page.evaluate(() => {
    const viewer = document.querySelector<HTMLElement>('.flow-viewer');
    const stage = document.querySelector<HTMLElement>('.flow-viewer__stage');
    const image = document.querySelector<HTMLImageElement>('.flow-viewer__image');
    const caption = document.querySelector<HTMLElement>('.flow-viewer__caption');
    const article = document.querySelector<HTMLElement>('.flow-item');

    if (!viewer || !stage || !image) throw new Error('Viewer geometry is incomplete');

    const toRect = (element: Element) => {
      const rect = element.getBoundingClientRect();

      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };

    const imageRect = image.getBoundingClientRect();

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      viewer: toRect(viewer),
      stage: toRect(stage),
      image: {
        ...toRect(image),
        centerX: imageRect.left + imageRect.width / 2,
        centerY: imageRect.top + imageRect.height / 2,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
      },
      caption: caption ? toRect(caption) : null,
      background: getComputedStyle(viewer).backgroundColor,
      articleTransform: article ? getComputedStyle(article).transform : null,
      parentIsBody: viewer.parentElement === document.body,
      horizontalOverflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

function expectWarmLightBackground(background: string) {
  const channels = background.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];

  expect(channels.length).toBeGreaterThanOrEqual(3);

  const [red, green, blue] = channels;

  expect(red).toBeGreaterThan(green);
  expect(green).toBeGreaterThan(blue);
  expect(red).toBeGreaterThanOrEqual(235);
  expect(blue).toBeGreaterThanOrEqual(220);
}

function expectViewerFillsViewport(geometry: ViewerGeometry) {
  const { viewport, viewer, stage, image, caption } = geometry;

  // The reader article keeps a transform after its entry animation; the viewer
  // must still be a direct child of <body> and use the real viewport.
  expect(geometry.articleTransform).not.toBe('none');
  expect(geometry.parentIsBody).toBe(true);
  expect(Math.abs(viewer.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(viewer.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(viewer.width - viewport.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(viewer.height - viewport.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(stage.x - viewer.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(stage.y - viewer.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(stage.width - viewer.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(stage.height - viewer.height)).toBeLessThanOrEqual(1);

  expect(image.width).toBeGreaterThan(0);
  expect(image.height).toBeGreaterThan(0);
  expect(image.x).toBeGreaterThanOrEqual(-1);
  expect(image.y).toBeGreaterThanOrEqual(-1);
  expect(image.x + image.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(image.y + image.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(Math.abs(image.centerX - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs(image.centerY - viewport.height / 2)).toBeLessThanOrEqual(1);

  const naturalRatio = image.naturalWidth / image.naturalHeight;
  const renderedRatio = image.width / image.height;

  expect(Math.abs(renderedRatio - naturalRatio)).toBeLessThan(0.02);

  if (caption) {
    expect(caption.x).toBeGreaterThanOrEqual(-1);
    expect(caption.y).toBeGreaterThanOrEqual(-1);
    expect(caption.x + caption.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(caption.y + caption.height).toBeLessThanOrEqual(viewport.height + 1);
    // The caption owns the reserved bottom band; it never sits on the photo.
    expect(caption.y).toBeGreaterThanOrEqual(image.y + image.height - 1);
  }

  expect(geometry.horizontalOverflow).toBeLessThanOrEqual(0);
  expectWarmLightBackground(geometry.background);
}

async function openViewer(page: Page) {
  await page.goto('/flow/reader-with-images');

  // Keep the Next.js development indicator out of the visual evidence.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });

  await expect(page.getByRole('heading', { name: 'Two rooms, one light', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: /Open image: First light/ }).click();

  const viewer = page.getByRole('dialog', { name: 'Image viewer' });

  await expect(viewer).toBeVisible();
  await expect(page.locator('.flow-viewer__image')).toBeVisible();
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.flow-viewer__image');

    return Boolean(image?.complete && image.naturalWidth > 0);
  });
  await page.waitForTimeout(220);

  return viewer;
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
    await page.waitForTimeout(220);

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

  for (const viewport of [
    { width: 390, height: 844, telegram: true },
    { width: 768, height: 1024, telegram: true },
    { width: 1024, height: 768, telegram: false },
    { width: 1440, height: 900, telegram: false },
  ]) {
    test(`${viewport.width}x${viewport.height}: viewer is a viewport-level, centred editorial gallery`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      if (viewport.telegram) await installTelegram(page);

      await mockFlowApis(page);
      await mockImages(page);

      await openViewer(page);

      const first = await readViewerGeometry(page);

      expectViewerFillsViewport(first);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `flow-image-viewer-${viewport.width}x${viewport.height}.png`),
      });

      // A long caption changes nothing about the photograph's optical centre.
      await page.getByRole('button', { name: 'Next image' }).click();
      await expect(page.locator('.flow-viewer__caption')).toContainText(
        'The archive, late morning'
      );
      await page.waitForTimeout(120);

      const second = await readViewerGeometry(page);

      expectViewerFillsViewport(second);
      expect(Math.abs(second.image.centerX - first.image.centerX)).toBeLessThanOrEqual(1);
      expect(Math.abs(second.image.centerY - first.image.centerY)).toBeLessThanOrEqual(1);

      await page.screenshot({
        path: path.join(
          ARTIFACT_DIR,
          `flow-image-viewer-long-caption-${viewport.width}x${viewport.height}.png`
        ),
      });
    });
  }

  test('viewer follows a live viewport resize without losing the photograph centre', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await mockFlowApis(page);
    await mockImages(page);
    await openViewer(page);

    const before = await readViewerGeometry(page);

    expectViewerFillsViewport(before);

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);

    const after = await readViewerGeometry(page);

    expectViewerFillsViewport(after);
    expect(after.viewport).toEqual({ width: 768, height: 1024 });
    expect(Math.abs(after.image.centerY - 1024 / 2)).toBeLessThanOrEqual(1);
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`${viewport.width}x${viewport.height}: portrait, square and landscape photographs stay uncropped and centred`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await mockFlowApis(page);
      await mockImages(page);
      await openViewer(page);

      for (const shape of [
        { name: 'portrait', width: 900, height: 1400, fill: '#b9a995' },
        { name: 'square', width: 1200, height: 1200, fill: '#a9b4ad' },
        { name: 'landscape', width: 1600, height: 900, fill: '#c4b29c' },
      ]) {
        await page.evaluate(({ width, height, fill, name }) => {
          const image = document.querySelector<HTMLImageElement>('.flow-viewer__image');

          if (!image) throw new Error('Viewer image missing');

          const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${fill}"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#f6f1e8" opacity="0.7"/><title>${name}</title></svg>`;

          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        }, shape);

        await page.waitForFunction(
          ({ width, height }) => {
            const image = document.querySelector<HTMLImageElement>('.flow-viewer__image');

            return Boolean(
              image?.complete && image.naturalWidth === width && image.naturalHeight === height
            );
          },
          { width: shape.width, height: shape.height }
        );
        await page.waitForTimeout(60);

        const geometry = await readViewerGeometry(page);

        expectViewerFillsViewport(geometry);
        expect(geometry.image.naturalWidth).toBe(shape.width);
        expect(geometry.image.naturalHeight).toBe(shape.height);
      }
    });
  }

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
    await page.waitForTimeout(220);

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
    await page.waitForTimeout(220);

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

  test('appearance panel keeps every control inside mobile, tablet and desktop viewports', async ({
    page,
  }) => {
    await mockFlowApis(page);
    await mockImages(page);
    await page.setViewportSize({ width: 320, height: 900 });
    await page.goto('/flow/reader-with-images');

    const appearance = page.getByRole('button', { name: 'Appearance settings' });

    await appearance.click();

    const dialog = page.getByRole('dialog', { name: 'Appearance' });

    await expect(dialog).toBeVisible();
    await page.waitForTimeout(250);

    const readLayout = () =>
      page.evaluate(() => {
        const read = (selector: string) => {
          const element = document.querySelector<HTMLElement>(selector);

          if (!element) return null;

          return {
            scrollWidth: element.scrollWidth,
            clientWidth: element.clientWidth,
            rectWidth: element.getBoundingClientRect().width,
          };
        };

        return {
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          bodyWidth: document.body.scrollWidth,
          panel: read('.flow-reader-dialog__panel'),
          settings: read('.flow-reader-settings'),
          controls: [
            '.flow-reader-settings__themes',
            '.flow-reader-settings__stepper',
            '.flow-reader-settings__range',
          ].map((selector) => ({ selector, ...read(selector) })),
        };
      });

    for (const width of [320, 390, 768, 820, 1280]) {
      await page.setViewportSize({ width, height: 900 });

      const layout = await readLayout();

      expect(layout.documentWidth).toBeLessThanOrEqual(width + 1);
      expect(layout.bodyWidth).toBeLessThanOrEqual(width + 1);
      expect(layout.panel).not.toBeNull();
      expect(layout.settings).not.toBeNull();
      expect(layout.panel!.scrollWidth).toBeLessThanOrEqual(layout.panel!.clientWidth + 1);
      expect(layout.settings!.scrollWidth).toBeLessThanOrEqual(layout.settings!.clientWidth + 1);

      for (const control of layout.controls) {
        expect(control).not.toBeNull();
        expect(control!.scrollWidth).toBeLessThanOrEqual(control!.clientWidth + 1);
        expect(control!.rectWidth).toBeLessThanOrEqual(width);
      }

      await expect(dialog.getByRole('button', { name: 'Light' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Increase text size' })).toBeVisible();
      await expect(dialog.getByRole('slider', { name: 'Line spacing' })).toBeVisible();

      const stepBox = await dialog
        .getByRole('button', { name: 'Increase text size' })
        .boundingBox();
      const themeBox = await dialog.getByRole('button', { name: 'Light' }).boundingBox();

      expect(stepBox).not.toBeNull();
      expect(themeBox).not.toBeNull();
      expect(stepBox!.width).toBeGreaterThanOrEqual(44);
      expect(stepBox!.height).toBeGreaterThanOrEqual(44);
      expect(themeBox!.height).toBeGreaterThanOrEqual(44);
    }

    // Browser text zoom and iOS Dynamic Type must not reintroduce overflow.
    await page.setViewportSize({ width: 320, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });

    const zoomed = await readLayout();

    expect(zoomed.documentWidth).toBeLessThanOrEqual(321);
    expect(zoomed.panel!.scrollWidth).toBeLessThanOrEqual(zoomed.panel!.clientWidth + 1);
    expect(zoomed.settings!.scrollWidth).toBeLessThanOrEqual(zoomed.settings!.clientWidth + 1);

    for (const control of zoomed.controls) {
      expect(control!.scrollWidth).toBeLessThanOrEqual(control!.clientWidth + 1);
    }
  });

  test('reader controls drop redundant Flow and Elsewhere labels without losing actions', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockFlowApis(page);
    await mockImages(page);

    await page.goto('/flow/reader-with-images');

    await expect(
      page.getByRole('heading', { name: 'Two rooms, one light', level: 1 })
    ).toBeVisible();
    await expect(page.locator('.flow-reader__identity')).toHaveCount(0);
    await expect(page.getByText('Elsewhere', { exact: true })).toHaveCount(0);

    const sources = page.locator('.flow-reader__sources');

    await expect(sources).toHaveAttribute('aria-label', 'This publication elsewhere');
    expect(await sources.locator('a').count()).toBeGreaterThanOrEqual(3);
    await expect(sources.getByRole('link', { name: /Bluesky/ })).toBeVisible();
    await expect(sources.getByRole('link', { name: /Telegram/ })).toBeVisible();
    await expect(sources.getByRole('link', { name: 'Journal ↗' })).toBeVisible();
    await expect(page.getByRole('link', { name: '← Flow' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Appearance settings' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Focus mode' })).toBeVisible();
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
