import { test, expect, type Page } from '@playwright/test';

const IMAGE_CASES = [
  { name: 'landscape', width: 1600, height: 1200 },
  { name: 'portrait', width: 900, height: 1600 },
  { name: 'square', width: 1200, height: 1200 },
  { name: 'tall', width: 600, height: 3000 },
  { name: 'wide', width: 3000, height: 500 },
] as const;

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, telegram: true },
  { name: 'ipad', width: 820, height: 1180, telegram: true },
  { name: 'phone-landscape', width: 844, height: 390, telegram: false },
  { name: 'desktop', width: 1280, height: 900, telegram: false },
] as const;

const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;

let activeImage: (typeof IMAGE_CASES)[number] = IMAGE_CASES[0];

type Box = {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
};

type FitGeometry = {
  viewport: { width: number; height: number };
  viewer: Box;
  panel: Box;
  stage: Box;
  figure: Box;
  frame: Box;
  image: Box;
  caption: Box | null;
  navButtons: Box[];
  natural: { width: number; height: number };
  objectFit: string;
  objectPosition: string;
};

async function installTelegram(page: Page) {
  await page.route('https://telegram.org/js/telegram-web-app.js', (route) => route.abort());

  await page.addInitScript(
    ({ safeTop, safeBottom }) => {
      const handlers = new Map<string, () => void>();
      const backHandlers: Array<() => void> = [];

      const webApp = {
        initData: 'query_id=fit-test&user=%7B%22id%22%3A1%7D&auth_date=1&hash=test',
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
        shareToStory() {},
        shareMessage() {},
        checkHomeScreenStatus(callback?: (status: string) => void) {
          callback?.('promptable');
        },
        addToHomeScreen(callback?: (status: string) => void) {
          callback?.('added');
        },
      };

      (window as unknown as { Telegram?: unknown }).Telegram = { WebApp: webApp };
    },
    { safeTop: SAFE_TOP, safeBottom: SAFE_BOTTOM }
  );
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
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Not allowed' }),
    });
  });
}

async function mockImages(page: Page) {
  await page.route('**/images.flow.test/**', async (route) => {
    const { width, height } = activeImage;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="#e8e2d8"/>
        <rect x="4" y="4" width="${width - 8}" height="${height - 8}" fill="none" stroke="#ff0000" stroke-width="8"/>
      </svg>
    `;

    await route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
  });
}

async function openViewer(page: Page) {
  await page.goto('/flow/reader-with-images');
  await page
    .getByRole('link', { name: /Open image/ })
    .first()
    .click();

  const viewer = page.getByRole('dialog', { name: 'Image viewer' });

  await expect(viewer).toBeVisible();
  await page.waitForTimeout(220);

  return viewer;
}

async function readGeometry(page: Page): Promise<FitGeometry> {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);

      if (!element) return null;

      const rect = element.getBoundingClientRect();

      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        right: rect.right,
        bottom: rect.bottom,
      };
    };

    const image = document.querySelector<HTMLImageElement>('.flow-viewer__image');

    if (!image) throw new Error('viewer image missing');

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      viewer: box('[data-testid="flow-image-viewer"]')!,
      panel: box('[data-testid="flow-image-viewer-panel"]')!,
      stage: box('.flow-viewer__stage')!,
      figure: box('.flow-viewer__figure')!,
      frame: box('.flow-viewer__frame')!,
      image: box('.flow-viewer__image')!,
      caption: box('.flow-viewer__caption'),
      navButtons: Array.from(document.querySelectorAll<HTMLElement>('.flow-viewer__nav')).map(
        (element) => {
          const rect = element.getBoundingClientRect();

          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            right: rect.right,
            bottom: rect.bottom,
          };
        }
      ),
      natural: { width: image.naturalWidth, height: image.naturalHeight },
      objectFit: getComputedStyle(image).objectFit,
      objectPosition: getComputedStyle(image).objectPosition,
    };
  });
}

test.describe('Flow image viewer — fit and containment', () => {
  for (const viewport of VIEWPORTS) {
    for (const imageCase of IMAGE_CASES) {
      test(`${viewport.name}: ${imageCase.name} image is fully contained at scale 1`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        if (viewport.telegram) await installTelegram(page);

        await mockFlowApis(page);
        activeImage = imageCase;
        await mockImages(page);

        const viewer = await openViewer(page);
        const geometry = await readGeometry(page);
        const { panel, stage, frame, image, caption, viewer: viewerBox, viewport: vp } = geometry;

        // The viewer is anchored to the real viewport, not to the reader article.
        expect(Math.abs(viewerBox.width - vp.width)).toBeLessThanOrEqual(1);
        expect(Math.abs(viewerBox.height - vp.height)).toBeLessThanOrEqual(1);

        // It is a floating panel with a visible gutter on every side.
        expect(panel.x).toBeGreaterThanOrEqual(8);
        expect(panel.y).toBeGreaterThanOrEqual(8);
        expect(panel.right).toBeLessThanOrEqual(vp.width - 8 + 0.5);
        expect(panel.bottom).toBeLessThanOrEqual(vp.height - 8 + 0.5);
        expect(panel.width).toBeLessThan(vp.width);
        expect(panel.height).toBeLessThan(vp.height);

        if (viewport.telegram) {
          expect(panel.y).toBeGreaterThanOrEqual(SAFE_TOP - 0.5);
          expect(panel.bottom).toBeLessThanOrEqual(vp.height - SAFE_BOTTOM + 0.5);
        }

        // The image box never escapes its frame, and the frame never escapes the stage.
        expect(image.x).toBeGreaterThanOrEqual(frame.x - 0.5);
        expect(image.y).toBeGreaterThanOrEqual(frame.y - 0.5);
        expect(image.right).toBeLessThanOrEqual(frame.right + 0.5);
        expect(image.bottom).toBeLessThanOrEqual(frame.bottom + 0.5);

        expect(frame.x).toBeGreaterThanOrEqual(stage.x - 0.5);
        expect(frame.y).toBeGreaterThanOrEqual(stage.y - 0.5);
        expect(frame.right).toBeLessThanOrEqual(stage.right + 0.5);
        expect(frame.bottom).toBeLessThanOrEqual(stage.bottom + 0.5);

        expect(stage.x).toBeGreaterThanOrEqual(panel.x - 0.5);
        expect(stage.y).toBeGreaterThanOrEqual(panel.y - 0.5);
        expect(stage.right).toBeLessThanOrEqual(panel.right + 0.5);
        expect(stage.bottom).toBeLessThanOrEqual(panel.bottom + 0.5);

        // The complete picture is painted inside the frame with contain semantics.
        expect(geometry.objectFit).toBe('contain');
        expect(geometry.objectPosition).toBe('50% 50%');

        const scale = Math.min(
          frame.width / geometry.natural.width,
          frame.height / geometry.natural.height
        );
        const paintedWidth = geometry.natural.width * scale;
        const paintedHeight = geometry.natural.height * scale;

        expect(paintedWidth).toBeLessThanOrEqual(frame.width + 0.5);
        expect(paintedHeight).toBeLessThanOrEqual(frame.height + 0.5);
        expect(
          Math.abs(paintedWidth - frame.width) < 1 || Math.abs(paintedHeight - frame.height) < 1
        ).toBe(true);

        // The caption sits below the frame and never overlaps or crops the picture.
        if (caption) {
          expect(caption.y).toBeGreaterThanOrEqual(frame.bottom - 0.5);
          expect(caption.bottom).toBeLessThanOrEqual(stage.bottom + 0.5);
        }

        // Gallery arrows live in the top bar, never over the image.
        for (const nav of geometry.navButtons) {
          expect(nav.bottom).toBeLessThanOrEqual(frame.y + 0.5);
        }

        expect(await viewer.getByText('1 / 2').isVisible()).toBe(true);
      });
    }
  }
});

test.describe('Flow image viewer — interaction and accessibility', () => {
  test('keeps close, keyboard, swipe, browser back, focus and scroll lock working', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);
    await mockFlowApis(page);
    activeImage = IMAGE_CASES[0];
    await mockImages(page);

    const viewer = await openViewer(page);

    // Close is focused, and Escape restores the reader.
    await expect(page.getByRole('button', { name: 'Close image viewer' })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

    await page.keyboard.press('Escape');
    await expect(viewer).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');

    // Arrow keys and the top-bar arrows move through the gallery.
    const reopened = await openViewer(page);

    await page.keyboard.press('ArrowRight');
    await expect(reopened.getByText('2 / 2')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(reopened.getByText('1 / 2')).toBeVisible();

    await reopened.getByRole('button', { name: 'Next image' }).click();
    await expect(reopened.getByText('2 / 2')).toBeVisible();

    // Browser Back closes the viewer rather than leaving the publication.
    await page.evaluate(() => window.history.back());
    await expect(reopened).toHaveCount(0);

    // Swipe-down dismissal still works.
    const swiped = await openViewer(page);
    const stage = page.locator('.flow-viewer__stage');

    await stage.dispatchEvent('touchstart', {
      touches: [{ identifier: 0, clientX: 195, clientY: 220 }],
    });
    await stage.dispatchEvent('touchend', {
      touches: [],
      changedTouches: [{ identifier: 0, clientX: 197, clientY: 380 }],
    });

    await expect(swiped).toHaveCount(0);
  });

  test('a long caption keeps its own scrollable band and never crops the image', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockFlowApis(page);
    activeImage = IMAGE_CASES[1];
    await mockImages(page);

    const viewer = await openViewer(page);

    await page.evaluate(() => {
      const caption = document.querySelector<HTMLElement>('.flow-viewer__caption');

      if (caption) {
        caption.textContent = 'A long editorial caption that keeps unfolding. '.repeat(24);
      }
    });

    await expect(viewer).toBeVisible();

    const geometry = await readGeometry(page);
    const { frame, image, caption, figure, stage } = geometry;

    expect(caption).not.toBeNull();
    expect(frame.height).toBeGreaterThan(80);

    expect(image.x).toBeGreaterThanOrEqual(frame.x - 0.5);
    expect(image.y).toBeGreaterThanOrEqual(frame.y - 0.5);
    expect(image.right).toBeLessThanOrEqual(frame.right + 0.5);
    expect(image.bottom).toBeLessThanOrEqual(frame.bottom + 0.5);

    expect(caption!.y).toBeGreaterThanOrEqual(frame.bottom - 0.5);
    expect(caption!.bottom).toBeLessThanOrEqual(stage.bottom + 0.5);
    expect(caption!.height).toBeLessThanOrEqual(figure.height * 0.28 + 1);

    const captionStyle = await page.locator('.flow-viewer__caption').evaluate((element) => {
      const style = getComputedStyle(element);

      return { overflowY: style.overflowY, maxHeight: style.maxHeight };
    });

    expect(captionStyle.overflowY).toBe('auto');
    expect(captionStyle.maxHeight).not.toBe('none');
  });

  test('reduced motion disables viewer entrance and control transitions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockFlowApis(page);
    activeImage = IMAGE_CASES[0];
    await mockImages(page);

    await openViewer(page);

    const styles = await page.evaluate(() => {
      const viewer = document.querySelector<HTMLElement>('[data-testid="flow-image-viewer"]');
      const image = document.querySelector<HTMLElement>('.flow-viewer__image');
      const nav = document.querySelector<HTMLElement>('.flow-viewer__nav');

      if (!viewer || !image || !nav) throw new Error('viewer elements missing');

      return {
        animationName: getComputedStyle(viewer).animationName,
        imageTransition: getComputedStyle(image).transition,
        navTransition: getComputedStyle(nav).transition,
      };
    });

    expect(styles.animationName).toBe('none');
    expect(styles.imageTransition).toBe('none');
    expect(styles.navTransition).toBe('none');
  });
});
