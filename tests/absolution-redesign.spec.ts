import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Locator, type Page } from '@playwright/test';

const ARTIFACT_DIR = path.resolve(
  process.cwd(),
  'artifacts/absolution-redesign'
);

const VIEWPORTS = [
  { label: 'small-phone-320x568', width: 320, height: 568 },
  { label: 'phone-390x844', width: 390, height: 844 },
  { label: 'ipad-768x1024', width: 768, height: 1024 },
  { label: 'desktop-1440x900', width: 1440, height: 900 },
];

async function hideDevIndicator(page: Page) {
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });
}

async function openAbsolutionModal(page: Page) {
  await page.goto('/temple');
  await hideDevIndicator(page);
  const trigger = page
    .getByRole('link', { name: 'Absolution', exact: true })
    .first();

  await expect(trigger).toBeVisible();
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Absolution' });
  await expect(dialog).toBeVisible();
  await expect(page.locator('.absolution-modal__dialog')).toBeVisible();
  await expect(page.locator('.temple-screen')).toBeVisible();

  return { dialog, trigger };
}

async function completeCeremony(page: Page, root?: Locator) {
  const scope = root ?? page.getByRole('dialog', { name: 'Absolution' });

  await scope.getByLabel('Pilgrim Identity').fill('Audit Pilgrim');
  await scope
    .getByRole('button', { name: /RECEIVE ABSOLUTION/i })
    .click();

  await expect(scope.getByTestId('absolution-certificate')).toBeVisible({
    timeout: 15_000,
  });
  await expect(scope.getByTestId('absolution-stamp')).toHaveAttribute(
    'data-visible',
    'true',
    { timeout: 8_000 }
  );
  await expect(
    scope.getByRole('button', { name: /SAVE CERTIFICATE/i })
  ).toBeEnabled();

  await expect
    .poll(
      async () =>
        scope
          .getByTestId('absolution-stamp-image')
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      { timeout: 15_000 }
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      async () =>
        scope
          .getByTestId('absolution-certificate-heart')
          .evaluate((image) => (image as HTMLImageElement).naturalWidth),
      { timeout: 15_000 }
    )
    .toBeGreaterThan(0);

  return scope.getByTestId('absolution-certificate');
}

test.describe('Absolution compact modal and certificate', () => {
  test.beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  for (const viewport of VIEWPORTS) {
    test(`renders the compact ritual on ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      const { dialog, trigger } = await openAbsolutionModal(page);

      await expect(
        dialog.getByRole('button', { name: 'Close Absolution' })
      ).toBeFocused();

      const modalBox = await page
        .locator('.absolution-modal__dialog')
        .boundingBox();

      expect(modalBox).not.toBeNull();
      expect(modalBox!.x).toBeGreaterThanOrEqual(0);
      expect(modalBox!.y).toBeGreaterThanOrEqual(0);
      expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(
        viewport.width + 1
      );
      expect(modalBox!.y + modalBox!.height).toBeLessThanOrEqual(
        viewport.height + 1
      );

      const primaryBox = await dialog
        .getByRole('button', { name: /RECEIVE ABSOLUTION/i })
        .boundingBox();

      expect(primaryBox).not.toBeNull();
      expect(primaryBox!.y + primaryBox!.height).toBeLessThanOrEqual(
        viewport.height + 1
      );
      expect(primaryBox!.x + primaryBox!.width).toBeLessThanOrEqual(
        viewport.width + 1
      );

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}-modal.png`),
      });

      const certificate = await completeCeremony(page);

      await certificate.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}-certificate.png`),
      });

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}-certificate-view.png`),
      });

      const modalBody = page.locator('.absolution-modal__body');
      await modalBody.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });

      const saveBox = await dialog
        .getByRole('button', { name: /SAVE CERTIFICATE/i })
        .boundingBox();
      const resetBox = await dialog
        .getByRole('button', { name: /NEW ABSOLUTION/i })
        .boundingBox();

      expect(saveBox).not.toBeNull();
      expect(resetBox).not.toBeNull();
      expect(saveBox!.y + saveBox!.height).toBeLessThanOrEqual(
        viewport.height + 1
      );
      expect(resetBox!.y + resetBox!.height).toBeLessThanOrEqual(
        viewport.height + 1
      );
      expect(saveBox!.x + saveBox!.width).toBeLessThanOrEqual(
        viewport.width + 1
      );
      expect(resetBox!.x + resetBox!.width).toBeLessThanOrEqual(
        viewport.width + 1
      );

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}-controls.png`),
      });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(1);

      if (viewport.label === 'phone-390x844') {
        const downloadPromise = page.waitForEvent('download', {
          timeout: 20_000,
        });

        await dialog
          .getByRole('button', { name: /SAVE CERTIFICATE/i })
          .click();

        const download = await downloadPromise;
        const exportPath = path.join(
          ARTIFACT_DIR,
          'phone-390x844-certificate-export.png'
        );

        expect(download.suggestedFilename()).toMatch(
          /^Sanctuary_Absolution_/
        );
        await download.saveAs(exportPath);
        expect(fs.statSync(exportPath).size).toBeGreaterThan(10_000);
      }

      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(page.locator('body')).not.toHaveClass(
        /absolution-modal-open/
      );
      await expect(trigger).toBeFocused();
    });
  }

  test('restores Temple scroll and focus after Escape', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    const { dialog, trigger } = await openAbsolutionModal(page);
    const before = await page.evaluate(() => window.scrollY);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    const after = await page.evaluate(() => window.scrollY);

    expect(Math.abs(after - before)).toBeLessThan(5);
    await expect(trigger).toBeFocused();
    await expect(page.locator('.temple-screen')).toBeVisible();
  });

  test('keeps /absolution as the canonical standalone page', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/absolution');
    await hideDevIndicator(page);

    const pageRoot = page.locator('.absolution-page');
    await expect(pageRoot).toHaveAttribute(
      'data-absolution-variant',
      'page'
    );
    await expect(page.getByRole('link', { name: /Back to Temple/i })).toBeVisible();

    await completeCeremony(page, page.locator('.absolution-page'));

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'desktop-standalone-certificate.png'),
      fullPage: true,
    });
  });

  test('Telegram BackButton closes the compact ritual', async ({ page }) => {
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
    const { dialog } = await openAbsolutionModal(page);

    await expect(page.locator('body')).toHaveClass(/telegram-app/);

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, 'telegram-phone-390x844-modal.png'),
    });

    await page.evaluate(() => {
      (
        window as unknown as { __telegramBack?: () => void }
      ).__telegramBack?.();
    });

    await expect(dialog).toBeHidden();
  });
});
