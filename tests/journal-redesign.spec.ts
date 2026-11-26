import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts/journal-redesign');

const VIEWPORTS = [
  { label: 'mobile-390x844', width: 390, height: 844 },
  { label: 'ipad-768x1024', width: 768, height: 1024 },
  { label: 'ipad-landscape-1024x768', width: 1024, height: 768 },
  { label: 'desktop-1440x900', width: 1440, height: 900 },
] as const;

const EN_TITLE = 'UNFRAMED // Episode 0: The Spectral Tiger';
const EN_SUMMARY = 'Pierrot, archives, and scarce attention.';
const RU_SUMMARY = 'Архив, Пьеро и границы авторства';

async function openJournal(page: Page, lang: 'en' | 'ru') {
  await page.goto(lang === 'ru' ? '/ru/journal' : '/journal');
  await page.addStyleTag({
    content: 'nextjs-portal { display: none !important; }',
  });

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: lang === 'ru' ? 'Журнал' : 'The Journal',
    })
  ).toBeVisible();
  await expect(page.locator('#current-issue-title')).toBeVisible();
  await expect(page.locator('#current-issue-title')).toHaveText(EN_TITLE);
  await expect(page.locator('#current-issue-title')).not.toContainText('Anton Merkurov');
  await expect(page.locator('#current-issue-title')).not.toContainText('Flow -');
}

function languageSwitcher(page: Page) {
  return page.locator('nav[aria-label="Language selection"], nav[aria-label="Выбор языка"]');
}

async function scrollToSectionStart(page: Page, selector: string) {
  await page.locator(selector).evaluate((element) => {
    const top = element.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: 'instant' });
  });
  await page.waitForTimeout(150);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectSectionsInsideViewport(page: Page) {
  for (const selector of ['#issues', '#contents', '#stream', '#archive', '#subscribe']) {
    const sectionOverflow = await page.locator(selector).evaluate((element) => {
      return element.scrollWidth - element.clientWidth;
    });
    expect(sectionOverflow, `${selector} must not overflow its own box`).toBeLessThanOrEqual(1);
  }
}

test.describe('Journal editorial front page', () => {
  test.beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  for (const viewport of VIEWPORTS) {
    for (const lang of ['en', 'ru'] as const) {
      test(`renders the ${lang.toUpperCase()} current issue at ${viewport.label}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await openJournal(page, lang);

        await expect(page.locator('html')).toHaveAttribute('lang', lang);
        await expect(languageSwitcher(page)).toHaveCount(1);

        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
          'href',
          lang === 'ru'
            ? 'https://www.merkurov.love/ru/journal'
            : 'https://www.merkurov.love/journal'
        );
        await expect(page.locator('link[hreflang="en"]').first()).toHaveAttribute(
          'href',
          'https://www.merkurov.love/journal'
        );
        await expect(page.locator('link[hreflang="ru"]').first()).toHaveAttribute(
          'href',
          'https://www.merkurov.love/ru/journal'
        );
        await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute(
          'content',
          lang === 'ru' ? 'ru_RU' : 'en_US'
        );

        const issue = page.locator('#issues');
        if (lang === 'en') {
          await expect(issue).toContainText('Issue №18');
          await expect(issue).toContainText(EN_SUMMARY);
        } else {
          await expect(issue).toContainText('Выпуск №26');
          await expect(issue).toContainText(RU_SUMMARY);
        }

        // The cover links directly to the issue and to the lead publication.
        await expect(
          page.locator(
            lang === 'en'
              ? 'a[href="/en/flow-issues/en-issue-18-2026-11-20"]'
              : 'a[href="/flow-issues/ru-issue-26-2026-11-20"]'
          )
        ).toHaveCount(1);
        await expect(page.locator('a[href="/unframed/spectral-tiger"]')).toHaveCount(1);

        // Contents is a compact selection: one main story plus at most one
        // material per format, never a duplicate of the cover story.
        const contents = page.locator('#contents');
        await expect(contents).toContainText('Merkurov x Pierrot');
        await expect(contents).toContainText(
          'A Wassily Kandinsky Sold by the Nahmads Fetches $85.8 M.'
        );
        await expect(contents.locator('a[href]').first()).toBeVisible();

        const selected = contents.locator('[data-material-id]');
        await expect(selected).toHaveCount(4);
        await expect(contents.locator('[data-material-id="lead-1"]')).toHaveCount(0);
        await expect(contents.locator('[data-material-format="post"]')).toHaveCount(1);
        await expect(contents.locator('[data-material-format="photo"]')).toHaveCount(1);
        await expect(contents.locator('[data-material-format="video"]')).toHaveCount(1);
        await expect(contents.locator('[data-material-format="link"]')).toHaveCount(1);

        // The cover links to the complete issue, not to a shortened copy.
        await expect(
          page.locator(
            lang === 'en'
              ? 'a[href="/en/flow-issues/en-issue-18-2026-11-20"]'
              : 'a[href="/flow-issues/ru-issue-26-2026-11-20"]'
          )
        ).toHaveCount(1);

        // Selected material links stay real (local routes and external sources).
        await expect(contents.locator('a[href="/flow/merkurov-x-pierrot-c1dlr"]')).toHaveCount(1);
        await expect(contents.locator('a[href="/flow/piero-joke"]')).toHaveCount(1);
        await expect(contents.locator('a[href^="https://www.artnews.com/"]')).toHaveCount(1);
        await expect(contents.locator('a[href^="https://www.youtube.com/"]')).toHaveCount(1);

        const firstMaterial = contents.locator('[data-material-kind]').first();
        await expect(firstMaterial).toBeVisible();

        const heading = page.locator('#current-issue-title');
        const headingOverflow = await heading.evaluate(
          (element) => element.scrollWidth - element.clientWidth
        );
        expect(headingOverflow).toBeLessThanOrEqual(1);

        const coverSize = await heading.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize)
        );
        const archiveTitle = page.locator('#archive li').first();
        await expect(archiveTitle).toBeVisible();
        const archiveSize = await archiveTitle
          .locator('span.font-serif')
          .first()
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
        expect(coverSize).toBeGreaterThan(archiveSize);

        // The first screen stays editorial rather than becoming a poster: the
        // masthead is bounded and the compact selection begins in view at the
        // desktop viewport.
        const mastheadSize = await page
          .getByRole('heading', { level: 1 })
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
        expect(mastheadSize).toBeLessThanOrEqual(76);
        expect(coverSize).toBeLessThanOrEqual(56);

        if (viewport.width >= 1440) {
          const contentsTop = await contents.evaluate(
            (element) => element.getBoundingClientRect().top + window.scrollY
          );
          expect(contentsTop).toBeLessThan(900);
        }

        await expectNoHorizontalOverflow(page);
        await expectSectionsInsideViewport(page);

        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `${viewport.label}-${lang}-first.png`),
        });

        await scrollToSectionStart(page, '#contents');

        // Images are lazy; bring each one into view before checking that the
        // real asset decoded instead of a broken placeholder.
        const images = contents.locator('img');
        const imageCount = await images.count();
        expect(imageCount).toBeGreaterThanOrEqual(2);
        for (let index = 0; index < imageCount; index++) {
          const image = images.nth(index);
          await image.scrollIntoViewIfNeeded();
          await expect
            .poll(
              async () => image.evaluate((element) => (element as HTMLImageElement).naturalWidth),
              { timeout: 10_000 }
            )
            .toBeGreaterThan(0);
        }

        await scrollToSectionStart(page, '#contents');
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `${viewport.label}-${lang}-contents.png`),
        });

        await scrollToSectionStart(page, '#archive');
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `${viewport.label}-${lang}-archive.png`),
        });

        await expectNoHorizontalOverflow(page);
      });
    }
  }

  test('language switch keeps the issue context and swaps the real edition', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openJournal(page, 'en');

    await languageSwitcher(page).getByRole('link', { name: 'Russian (RU)' }).click();
    await page.waitForURL('**/ru/journal');
    await openJournal(page, 'ru');

    await expect(page.locator('#issues')).toContainText('Выпуск №26');
    await expect(page.locator('#issues')).toContainText(RU_SUMMARY);
    await expect(page.locator('#issues')).toContainText('Язык оригинала');
    await expectNoHorizontalOverflow(page);

    await languageSwitcher(page).getByRole('link', { name: 'English (EN)' }).click();
    await page.waitForURL('**/journal');
    await openJournal(page, 'en');

    await expect(page.locator('#issues')).toContainText('Issue №18');
    await expect(page.locator('#issues')).toContainText(EN_SUMMARY);
    await expect(page.locator('#issues')).toContainText('Original language');
    await expectNoHorizontalOverflow(page);
  });
});
