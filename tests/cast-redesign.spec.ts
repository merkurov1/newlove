import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { test, expect, type Page } from '@playwright/test';

const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts/cast-redesign');

const VIEWPORTS = [
  { label: 'small-phone-320x568', width: 320, height: 568 },
  { label: 'phone-390x844', width: 390, height: 844 },
  { label: 'ipad-portrait-768x1024', width: 768, height: 1024 },
  { label: 'ipad-landscape-1024x768', width: 1024, height: 768 },
  { label: 'desktop-1440x900', width: 1440, height: 900 },
];

const ANALYSIS = {
  archetype: 'UNFRAMED',
  agency_index: 82,
  scores: {
    VOID: 10,
    STONE: 20,
    NOISE: 15,
    UNFRAMED: 80,
  },
  executive_summary:
    'You act from clear intent and tolerate ambiguity without needing an audience.',
  structural_weaknesses:
    'You still explain the past more often than you shape the next concrete step.',
  core_assets: 'Specific memory, structural thinking and a refusal to perform for approval.',
  strategic_directive: 'Choose one next action today and execute it without an audience.',
};

const CAST_RESPONSE = {
  analysis: ANALYSIS,
  archetype: 'UNFRAMED',
  agencyIndex: 82,
  recordId: 'record-cast-12345678',
  captureToken: 'capture-token-1',
};

async function hideDevIndicator(page: Page) {
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });
}

async function routeCastApi(page: Page) {
  await page.route(/\/api\/cast$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(CAST_RESPONSE),
    });
  });

  await page.route(/\/api\/cast\/capture$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });
}

async function openStandalone(page: Page) {
  await page.goto('/cast');
  await hideDevIndicator(page);

  await expect(page.locator('.cast-page[data-cast-variant="page"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Choose your language/i })).toBeVisible();

  return page.locator('.cast-page');
}

async function openModal(page: Page, { fresh = true }: { fresh?: boolean } = {}) {
  await page.goto('/temple');
  await hideDevIndicator(page);

  if (fresh) {
    await page.evaluate(() => window.sessionStorage.clear());
  }

  const trigger = page.getByRole('link', { name: 'Cast', exact: true }).first();

  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Cast ritual' });

  await expect(dialog).toBeVisible();
  await expect(page.locator('.temple-modal')).toBeVisible();
  await expect(page.locator('.cast-page[data-cast-variant="modal"]')).toBeVisible();
  await page.waitForTimeout(500);

  return { dialog, trigger };
}

async function selectLanguage(
  page: Page,
  scope: 'page' | 'modal',
  language: 'English' | 'Русский' = 'English'
) {
  const root =
    scope === 'modal'
      ? page.getByRole('dialog', { name: 'Cast ritual' })
      : page.locator('.cast-page');

  await root
    .getByRole('button', {
      name: new RegExp(`Continue in ${language}`, 'i'),
    })
    .click();

  await expect(root.getByText(/Question 01 \/ 10/i)).toBeVisible();
}

async function answerAllQuestions(page: Page, scope: 'page' | 'modal') {
  const root =
    scope === 'modal'
      ? page.getByRole('dialog', { name: 'Cast ritual' })
      : page.locator('.cast-page');

  for (let index = 1; index <= 10; index += 1) {
    const textarea = root.getByRole('textbox');

    await textarea.fill(`Answer number ${index}`);

    await root
      .getByRole('button', {
        name: index === 10 ? /ANALYZE/i : /NEXT/i,
      })
      .click();
  }

  await expect(root.getByText(/\[UNFRAMED\]/)).toBeVisible({
    timeout: 30_000,
  });
  await expect(root.getByText(/AGENCY INDEX/i)).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );

  expect(overflow).toBeLessThanOrEqual(1);
}

const TOKEN_NAMES = ['--canvas', '--ink', '--muted', '--faint', '--gold', '--line'] as const;

async function readTokens(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((element, names) => {
    const styles = getComputedStyle(element);
    return Object.fromEntries(
      names.map((name) => [name, styles.getPropertyValue(name).trim()])
    );
  }, TOKEN_NAMES);
}

async function composePair(left: string, right: string, out: string) {
  if (!fs.existsSync(left) || !fs.existsSync(right)) return;

  const width = 720;

  const [leftBuffer, rightBuffer] = await Promise.all([
    sharp(left).resize({ width }).toBuffer(),
    sharp(right).resize({ width }).toBuffer(),
  ]);

  const [leftMeta, rightMeta] = await Promise.all([
    sharp(leftBuffer).metadata(),
    sharp(rightBuffer).metadata(),
  ]);

  const height = Math.max(leftMeta.height ?? 450, rightMeta.height ?? 450);

  await sharp({
    create: {
      width: width * 2,
      height,
      channels: 3,
      background: '#f6f1e8',
    },
  })
    .composite([
      { input: leftBuffer, left: 0, top: 0 },
      { input: rightBuffer, left: width, top: 0 },
    ])
    .png()
    .toFile(out);
}

test.describe('Cast matches the Sanctuary design system', () => {
  test('standalone Cast resolves the same tokens as the Temple homepage', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto('/temple');
    await hideDevIndicator(page);
    await expect(page.locator('[data-temple-theme="light"]')).toBeVisible();

    const templeTokens = await readTokens(page, '[data-temple-theme="light"]');
    const templeBody = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'temple-1440x900.png'),
    });

    await openStandalone(page);

    const castTokens = await readTokens(page, '.cast-page[data-cast-variant="page"]');
    const castBody = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor
    );

    expect(castTokens).toEqual(templeTokens);
    expect(castBody).toBe(templeBody);

    // The Cast-specific stylesheet must not introduce its own surface values.
    const hasLegacySurface = await page.evaluate(() => {
      const pageElement = document.querySelector('.cast-page');
      if (!pageElement) return true;
      return Array.from(pageElement.querySelectorAll<HTMLElement>('*')).some((node) => {
        const styles = getComputedStyle(node);
        return (
          styles.backgroundColor === 'rgb(250, 248, 245)' ||
          styles.backgroundColor === 'rgb(20, 18, 16)'
        );
      });
    });

    expect(hasLegacySurface).toBe(false);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'desktop-1440x900-standalone-sanctuary.png'),
    });

    await composePair(
      path.join(ARTIFACT_DIR, 'temple-1440x900.png'),
      path.join(ARTIFACT_DIR, 'desktop-1440x900-standalone-sanctuary.png'),
      path.join(ARTIFACT_DIR, 'side-by-side-light.png')
    );
  });

  test('keeps the first phone screen minimal and both languages reachable', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStandalone(page);

    await expect(page.getByText('The Sanctuary')).toHaveCount(1);

    const english = await page
      .getByRole('button', { name: /Continue in English/i })
      .boundingBox();
    const russian = await page
      .getByRole('button', { name: /Continue in Русский/i })
      .boundingBox();

    expect(english).not.toBeNull();
    expect(russian).not.toBeNull();
    expect(english!.y + english!.height).toBeLessThanOrEqual(844);
    expect(russian!.y + russian!.height).toBeLessThanOrEqual(844);
  });

  test('modal Cast uses the lamplight side of the same token scope', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openModal(page);

    const modalTokens = await readTokens(
      page,
      '.cast-page[data-cast-variant="modal"]'
    );

    // These are the documented `tokensDark` values shared with the Temple
    // chronicles dialog, not a Cast-only night palette.
    expect(modalTokens['--canvas']).toBe('#1c1713');
    expect(modalTokens['--ink']).toBe('#f6f1e8');
    expect(modalTokens['--muted']).toBe('#cfc0a8');
    expect(modalTokens['--gold']).toBe('#e4bc72');

    const surface = await page
      .locator('.cast-page[data-cast-variant="modal"]')
      .getAttribute('data-cast-surface');

    expect(surface).toBe('lamplight');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'desktop-1440x900-modal-lamplight.png'),
    });

    await composePair(
      path.join(ARTIFACT_DIR, 'temple-1440x900.png'),
      path.join(ARTIFACT_DIR, 'desktop-1440x900-modal-lamplight.png'),
      path.join(ARTIFACT_DIR, 'side-by-side-lamplight.png')
    );
  });
});

test.describe('Cast language selector, question and result stages', () => {
  test.beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  for (const viewport of VIEWPORTS) {
    test(`renders standalone and modal Cast on ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      await openStandalone(page);

      await expect(page.getByRole('group', { name: /Reading language/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Continue in English/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Continue in Русский/i })).toBeVisible();
      await expect(page.getByText(/Protocol 01/i)).toHaveCount(0);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}-standalone-language.png`),
      });

      await selectLanguage(page, 'page');

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}-standalone-question.png`),
      });

      await expectNoHorizontalOverflow(page);

      await openModal(page);

      const dialog = page.getByRole('dialog', { name: 'Cast ritual' });

      await expect(page.locator('.temple-modal')).toHaveCount(1);
      await expect(page.getByRole('dialog')).toHaveCount(1);
      await expect(
        page.locator('.cast-page[data-cast-variant="modal"] .temple-topbar')
      ).toHaveCount(0);
      await expect(page.locator('.cast-page[data-cast-variant="modal"] h1')).toHaveCount(0);

      const dialogBox = await dialog.boundingBox();

      expect(dialogBox).not.toBeNull();
      expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
      expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
      expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewport.height + 1);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}-modal-language.png`),
      });

      await selectLanguage(page, 'modal');

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}-modal-question.png`),
      });

      await expectNoHorizontalOverflow(page);
      await expect(page.locator('body')).toHaveClass(/ritual-modal-open/);
    });
  }

  test('completes the standalone result and keeps email capture', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await routeCastApi(page);
    await openStandalone(page);

    await selectLanguage(page, 'page');
    await answerAllQuestions(page, 'page');

    await expect(page.getByRole('button', { name: /Secure/i })).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'phone-390x844-standalone-result.png'),
    });

    await page.getByPlaceholder('name@domain.com').fill('pilgrim@example.com');
    await page.getByRole('button', { name: /Secure/i }).click();

    await expect(page.getByText(/Reading secured to your email/i)).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'phone-390x844-standalone-email.png'),
    });

    const draft = await page.evaluate(() => window.sessionStorage.getItem('cast:draft:v1'));

    expect(draft).toContain('"emailSent":true');
  });

  test('completes the same result flow inside the modal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await routeCastApi(page);
    await openModal(page);

    await selectLanguage(page, 'modal');
    await answerAllQuestions(page, 'modal');

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'phone-390x844-modal-result.png'),
    });

    await expect(
      page.getByRole('dialog', { name: 'Cast ritual' }).getByText(/\[UNFRAMED\]/)
    ).toBeVisible();
  });
});

test.describe('Cast modal behaviour', () => {
  test('closes on Escape, restores focus and Temple scroll', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto('/temple');
    await hideDevIndicator(page);

    const trigger = page.getByRole('link', { name: 'Cast', exact: true }).first();

    await trigger.scrollIntoViewIfNeeded();

    const before = await page.evaluate(() => window.scrollY);

    await trigger.click();

    const dialog = page.getByRole('dialog', { name: 'Cast ritual' });

    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: '← Temple' })
    ).toBeFocused();

    await page.keyboard.press('Escape');

    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/temple$/);
    await expect(trigger).toBeFocused();
    await expect(page.locator('body')).not.toHaveClass(/ritual-modal-open/);

    const after = await page.evaluate(() => window.scrollY);

    expect(Math.abs(after - before)).toBeLessThan(5);
  });

  test('keeps answers when switching from standalone to modal', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openStandalone(page);

    await selectLanguage(page, 'page');

    await page.getByRole('textbox').fill('A draft answer kept across modes');
    await page.getByRole('button', { name: /NEXT/i }).click();

    await expect(page.getByText(/Question 02 \/ 10/i)).toBeVisible();

    await openModal(page, { fresh: false });

    const dialog = page.getByRole('dialog', { name: 'Cast ritual' });

    await expect(dialog.getByText(/Question 02 \/ 10/i)).toBeVisible();
    await expect(dialog.getByRole('button', { name: /NEXT/i })).toBeDisabled();
  });

  test('stays usable on a short phone screen with the keyboard viewport', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openModal(page);

    await selectLanguage(page, 'modal');

    const dialog = page.getByRole('dialog', { name: 'Cast ritual' });
    const textarea = dialog.getByRole('textbox');

    await textarea.focus();
    await textarea.fill('Short screen answer');

    await page.setViewportSize({ width: 320, height: 400 });

    await textarea.scrollIntoViewIfNeeded();
    await expect(textarea).toBeVisible();

    const content = page.locator('.temple-modal__content');
    const metrics = await content.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));

    expect(metrics.scrollHeight).toBeGreaterThanOrEqual(metrics.clientHeight);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'small-phone-320x400-keyboard-question.png'),
    });

    await dialog.getByRole('button', { name: /NEXT/i }).click();
    await expect(dialog.getByText(/Question 02 \/ 10/i)).toBeVisible();
  });

  test('closes from the Telegram BackButton in an emulated WebView', async ({ page }) => {
    // The production SDK is loaded lazily and would overwrite the stub. Block
    // it so the emulated launch data stays authoritative and deterministic.
    await page.route('https://telegram.org/js/telegram-web-app.js', (route) =>
      route.abort()
    );

    await page.addInitScript(() => {
      type BackHandler = () => void;
      type TestWindow = Window & {
        __telegramBack?: () => void;
        Telegram?: { WebApp: Record<string, unknown> };
      };
      const testWindow = window as unknown as TestWindow;
      const backHandlers = new Set<BackHandler>();

      testWindow.__telegramBack = () => {
        backHandlers.forEach((handler) => handler());
      };

      testWindow.Telegram = {
        WebApp: {
          initData: 'audit-init-data',
          initDataUnsafe: {},
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
            onClick(handler: BackHandler) {
              backHandlers.add(handler);
            },
            offClick(handler: BackHandler) {
              backHandlers.delete(handler);
            },
          },
        },
      };
    });

    await page.setViewportSize({ width: 390, height: 844 });

    const { dialog } = await openModal(page);

    await expect(page.locator('body')).toHaveClass(/telegram-app/);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'telegram-phone-390x844-modal-language.png'),
    });

    await page.evaluate(() => {
      (window as unknown as { __telegramBack?: () => void }).__telegramBack?.();
    });

    await expect(dialog).toBeHidden();
  });
});
