import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts/flow-composer-redesign');

// A 1×1 neutral PNG keeps the screenshot deterministic without external media.
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z2xkAAAAASUVORK5CYII=',
  'base64'
);

const VIEWPORTS = [
  { label: 'mobile-390x844', width: 390, height: 844 },
  { label: 'ipad-768x1024', width: 768, height: 1024 },
  { label: 'desktop-1440x900', width: 1440, height: 900 },
] as const;

type ComposerMode = 'link' | 'youtube' | 'fallback';

async function installTelegram(page: Page) {
  await page.addInitScript(() => {
    const clickHandlers = new Set<() => void>();
    const mainButton = {
      text: '',
      isVisible: false,
      isActive: true,
      show() {
        this.isVisible = true;
      },
      hide() {
        this.isVisible = false;
      },
      enable() {
        this.isActive = true;
      },
      disable() {
        this.isActive = false;
      },
      setText(text: string) {
        this.text = text;
      },
      setParams(params: { text?: string; is_active?: boolean; is_visible?: boolean }) {
        this.text = params.text ?? this.text;
        this.isActive = params.is_active ?? this.isActive;
        this.isVisible = params.is_visible ?? this.isVisible;
      },
      onClick(handler: () => void) {
        clickHandlers.add(handler);
      },
      offClick(handler: () => void) {
        clickHandlers.delete(handler);
      },
    };

    (window as unknown as { __flowComposerWrite: () => void }).__flowComposerWrite = () => {
      clickHandlers.forEach((handler) => handler());
    };

    Object.defineProperty(window, '__flowComposerReady', {
      configurable: true,
      get: () => clickHandlers.size > 0,
    });

    const webApp = {
      initData: 'query_id=test&user=test',
      initDataUnsafe: { start_param: '' },
      version: '8.0',
      platform: 'ios',
      colorScheme: 'light',
      viewportHeight: window.innerHeight,
      viewportStableHeight: window.innerHeight,
      isExpanded: true,
      isFullscreen: false,
      safeAreaInset: { top: 0, right: 0, bottom: 0, left: 0 },
      contentSafeAreaInset: { top: 0, right: 0, bottom: 0, left: 0 },
      themeParams: {
        bg_color: '#faf8f4',
        secondary_bg_color: '#faf8f4',
        text_color: '#37332d',
        hint_color: '#9a9388',
        button_color: '#37332d',
        button_text_color: '#ffffff',
      },
      MainButton: mainButton,
      HapticFeedback: {
        impactOccurred() {},
        selectionChanged() {},
        notificationOccurred() {},
      },
      BackButton: {
        isVisible: false,
        show() {},
        hide() {},
        onClick() {},
        offClick() {},
      },
      ready() {},
      expand() {},
      requestFullscreen() {},
      exitFullscreen() {},
      disableVerticalSwipes() {},
      enableVerticalSwipes() {},
      setHeaderColor() {},
      setBackgroundColor() {},
      setBottomBarColor() {},
      onEvent() {},
      offEvent() {},
    };

    (window as unknown as { Telegram: unknown }).Telegram = { WebApp: webApp };
  });
}

async function mockComposerApis(page: Page, mode: ComposerMode = 'link') {
  await page.route('https://telegram.org/**', (route) => route.abort());
  await page.route('https://cdn.example.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER_PNG })
  );
  await page.route('https://i.ytimg.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PLACEHOLDER_PNG })
  );

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (body: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });

    if (url.pathname === '/api/admin/items/list') {
      await json({});
      return;
    }

    if (url.pathname === '/api/flow/items' && request.method() === 'GET') {
      await json({ items: [], hasMore: false });
      return;
    }

    if (url.pathname === '/api/flow/parse-url') {
      const target = url.searchParams.get('url') ?? '';

      if (mode === 'fallback') {
        await route.fulfill({
          status: 502,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Preview unavailable' }),
        });
        return;
      }

      if (mode === 'youtube') {
        await json({
          url: target,
          youtube: {
            video_id: 'aaaaaaaaaaa',
            title: 'A quiet film',
            author_name: 'Studio',
            thumbnail_url: 'https://i.ytimg.com/vi/aaaaaaaaaaa/mqdefault.jpg',
          },
        });
        return;
      }

      await json({
        url: target,
        domain: 'example.com',
        site_name: 'Example',
        title: 'Example article',
        description: 'A full description that belongs on the published post, not in the composer.',
        image: 'https://cdn.example.com/og.jpg',
      });
      return;
    }

    if (url.pathname === '/api/flow/proofread') {
      const payload = request.postDataJSON() as { text?: string };
      await json({
        text: (payload.text ?? '').replace('wrld', 'world'),
        unchanged: false,
      });
      return;
    }

    if (url.pathname === '/api/upload') {
      await json({ success: true, file: { url: 'https://cdn.example.com/photo.jpg' } });
      return;
    }

    await json({ success: true });
  });
}

async function openComposer(page: Page) {
  await page.goto('/flow');
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });

  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Boolean((window as unknown as { __flowComposerReady?: boolean }).__flowComposerReady)
        ),
      { timeout: 20_000 }
    )
    .toBe(true);

  await page.evaluate(() => {
    (window as unknown as { __flowComposerWrite?: () => void }).__flowComposerWrite?.();
  });

  await expect(page.getByRole('dialog', { name: 'New Flow post' })).toBeVisible();
  await expect(page.getByLabel('Post text')).toBeFocused();
}

async function pasteText(page: Page, text: string) {
  await page.getByLabel('Post text').evaluate((element, value) => {
    const transfer = new DataTransfer();
    transfer.setData('text/plain', value);
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: transfer,
        bubbles: true,
        cancelable: true,
      })
    );
  }, text);
}

async function readComposerMetrics(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');

    if (!dialog) throw new Error('composer dialog missing');

    const textarea = dialog.querySelector<HTMLTextAreaElement>('textarea[aria-label="Post text"]');
    const focusRule = dialog.querySelector<HTMLElement>('[data-composer-focus-rule]');
    const footer = dialog.querySelector<HTMLElement>('footer');
    const header = dialog.querySelector<HTMLElement>('header');

    if (!textarea || !footer || !header) throw new Error('composer layout missing');

    const rect = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();

      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };

    const style = getComputedStyle(textarea);
    const focusRuleStyle = focusRule ? getComputedStyle(focusRule) : null;

    return {
      dialog: rect(dialog),
      textarea: rect(textarea),
      header: rect(header),
      footer: rect(footer),
      controls: Array.from(dialog.querySelectorAll('button')).map(
        (button) => button.getAttribute('aria-label') || button.textContent?.trim() || ''
      ),
      textareaStyle: {
        outlineColor: style.outlineColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        boxShadow: style.boxShadow,
        fontSize: style.fontSize,
      },
      focusRuleStyle: {
        backgroundColor: focusRuleStyle?.backgroundColor ?? '',
        width: focusRuleStyle?.width ?? '',
        height: focusRuleStyle?.height ?? '',
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        visualWidth: window.visualViewport?.width ?? window.innerWidth,
        visualHeight: window.visualViewport?.height ?? window.innerHeight,
        visualTop: window.visualViewport?.offsetTop ?? 0,
      },
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

test.describe('Flow composer editorial surface', () => {
  test.beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  for (const viewport of VIEWPORTS) {
    test(`keeps four controls and a dominant writing field at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installTelegram(page);
      await mockComposerApis(page, 'link');
      await openComposer(page);

      const metrics = await readComposerMetrics(page);

      expect(metrics.controls).toEqual([
        'Close composer',
        'Attach images',
        'Proofread text',
        'Post',
      ]);
      expect(metrics.controls).not.toContain('Clear');
      expect(metrics.textarea.width).toBeGreaterThan(metrics.dialog.width * 0.8);
      expect(metrics.textarea.height).toBeGreaterThan(300);
      expect(metrics.textareaStyle.outlineColor).not.toBe('rgb(138, 131, 120)');
      expect(metrics.textareaStyle.outlineColor).toBe('rgba(0, 0, 0, 0)');
      expect(metrics.textareaStyle.backgroundImage).toBe('none');
      expect(metrics.focusRuleStyle.backgroundColor).toBe('rgb(138, 131, 120)');
      expect(metrics.focusRuleStyle.height).toBe('2px');
      expect(metrics.focusRuleStyle.width).toBe('32px');
      expect(metrics.textareaStyle.fontSize).toBe(viewport.width >= 640 ? '20px' : '18px');
      expect(metrics.footer.bottom).toBeLessThanOrEqual(viewport.height + 1);
      expect(metrics.header.bottom).toBeLessThanOrEqual(metrics.textarea.top + 1);
      expect(metrics.documentOverflow).toBeLessThanOrEqual(1);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}.png`),
      });
    });
  }

  test('places the proofread wand beside Post and applies the correction in place', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);
    await mockComposerApis(page, 'link');
    await openComposer(page);

    const textarea = page.getByLabel('Post text');
    await textarea.fill('Hello, wrld. This is corect.');

    const wand = page.getByRole('button', { name: 'Proofread text' });
    const post = page.getByRole('button', { name: 'Post' });

    await expect(wand).toBeVisible();
    await expect(wand).toBeEnabled();

    const wandBox = await wand.boundingBox();
    const postBox = await post.boundingBox();

    expect(wandBox).not.toBeNull();
    expect(postBox).not.toBeNull();
    expect((wandBox?.x ?? 0) + (wandBox?.width ?? 0)).toBeLessThanOrEqual(
      (postBox?.x ?? 0) + 1,
    );

    await wand.click();

    await expect(textarea).toHaveValue('Hello, world. This is corect.');
    await expect(page.getByRole('dialog', { name: /proofread/i })).toHaveCount(0);
    await expect(wand).toBeEnabled();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'proofread-wand-mobile.png'),
    });
  });

  test('shows a persistent compact link receipt at mobile and desktop sizes', async ({ page }) => {
    for (const viewport of [
      { label: 'mobile', width: 390, height: 844 },
      { label: 'desktop', width: 1440, height: 900 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await installTelegram(page);
      await mockComposerApis(page, 'link');
      await openComposer(page);

      await pasteText(page, 'Read this https://example.com/article');
      await expect(page.getByText('Example article')).toBeVisible();
      await expect(page.getByText('Example', { exact: true })).toBeVisible();
      await expect(
        page.getByText(
          'A full description that belongs on the published post, not in the composer.'
        )
      ).toHaveCount(0);

      const receipt = page.locator('[data-attachment="link"]');

      expect(await receipt.count()).toBe(1);
      expect(await receipt.getAttribute('data-preview-state')).toBe('complete');

      const box = await receipt.boundingBox();

      expect(box?.height ?? 0).toBeLessThanOrEqual(40);
      expect(await page.getByRole('button', { name: 'Remove link' }).count()).toBe(1);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `link-receipt-${viewport.label}.png`),
      });

      await page.goto('about:blank');
    }
  });

  test('renders YouTube as a compact row rather than a video card', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);
    await mockComposerApis(page, 'youtube');
    await openComposer(page);

    await pasteText(page, 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
    await expect(page.getByText('A quiet film')).toBeVisible();
    await expect(page.getByText('Studio · YouTube')).toBeVisible();

    const receipt = page.locator('[data-attachment="youtube"]');
    const box = await receipt.boundingBox();

    expect(box?.height ?? 0).toBeLessThanOrEqual(48);
    expect(await receipt.locator('[class*="aspect-"]').count()).toBe(0);
    expect(await page.getByRole('button', { name: 'Remove video' }).count()).toBe(1);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'youtube-receipt-mobile.png'),
    });
  });

  test('keeps a failed preview as a truthful attached fallback', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);
    await mockComposerApis(page, 'fallback');
    await openComposer(page);

    await pasteText(page, 'https://example.com/still-attached');
    await expect(page.getByText('Preview unavailable')).toBeVisible();
    await expect(page.getByText('example.com')).toBeVisible();

    const receipt = page.locator('[data-attachment="link"]');

    expect(await receipt.getAttribute('data-preview-state')).toBe('fallback');
    expect(await page.getByRole('button', { name: 'Remove link' }).count()).toBe(1);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'fallback-receipt-mobile.png'),
    });
  });

  test('keeps uploaded images in a small removable strip', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);
    await mockComposerApis(page, 'link');
    await openComposer(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: PLACEHOLDER_PNG,
    });

    const thumbnail = page.locator('[data-attachment="image"]');

    await expect(thumbnail).toHaveCount(1);

    const box = await thumbnail.boundingBox();

    expect(box?.width ?? 0).toBeLessThanOrEqual(64);
    expect(box?.height ?? 0).toBeLessThanOrEqual(64);
    expect(await page.getByRole('button', { name: 'Remove image' }).count()).toBe(1);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'image-strip-mobile.png'),
    });
  });

  test('stays inside a simulated iOS keyboard viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await installTelegram(page);
    await mockComposerApis(page, 'link');
    await openComposer(page);

    await page.evaluate(() => {
      const viewport = window.visualViewport;

      if (!viewport) return;

      Object.defineProperty(viewport, 'height', {
        configurable: true,
        get: () => 420,
      });
      Object.defineProperty(viewport, 'offsetTop', {
        configurable: true,
        get: () => 0,
      });
      viewport.dispatchEvent(new Event('resize'));
    });

    await expect
      .poll(async () => (await page.getByRole('dialog').boundingBox())?.height ?? 0)
      .toBeLessThanOrEqual(421);

    const metrics = await readComposerMetrics(page);

    expect(metrics.dialog.height).toBeLessThanOrEqual(421);
    expect(metrics.textarea.height).toBeGreaterThan(180);
    expect(metrics.footer.bottom).toBeLessThanOrEqual(421);
    expect(metrics.documentOverflow).toBeLessThanOrEqual(1);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'keyboard-420-mobile.png'),
    });
  });
});
