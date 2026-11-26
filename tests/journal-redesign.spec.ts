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

        // The fixed site header must not cover the Journal masthead.
        const headerBox = await page.locator('header.site-header').first().boundingBox();
        const mastheadBox = await page.getByRole('heading', { level: 1 }).evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom };
        });
        expect(mastheadBox.top).toBeGreaterThan((headerBox?.y ?? 0) + (headerBox?.height ?? 0) - 4);

        // Issue identity lives in its own open rail; the main story module below
        // it never repeats the issue label or number as part of the headline.
        const issueRail = page.locator('#current-issue-heading');
        await expect(issueRail).toContainText(lang === 'en' ? 'Current issue' : 'Текущий выпуск');
        await expect(issueRail).toContainText(lang === 'en' ? '№18' : '№26');
        const mainStory = page.locator('#issues [data-role="main-material"]');
        await expect(mainStory).toBeVisible();
        await expect(mainStory).not.toContainText(
          lang === 'en' ? 'Current issue' : 'Текущий выпуск'
        );
        await expect(mainStory).not.toContainText(lang === 'en' ? '№18' : '№26');

        // The current issue is an open cover, not a bordered or filled panel.
        const coverStyle = await mainStory.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            borderTop: style.borderTopWidth,
            borderRight: style.borderRightWidth,
            borderBottom: style.borderBottomWidth,
            borderLeft: style.borderLeftWidth,
          };
        });
        expect(coverStyle.background).toBe('rgba(0, 0, 0, 0)');
        for (const side of ['borderTop', 'borderRight', 'borderBottom', 'borderLeft'] as const) {
          expect(Number.parseFloat(coverStyle[side]), `cover ${side}`).toBe(0);
        }

        // The main story offers its own action; the full issue remains a
        // separate transition that closes the issue composition.
        await expect(
          mainStory.getByRole('link', { name: /Open material|Открыть материал/ })
        ).toBeVisible();
        await expect(
          mainStory.getByRole('link', { name: /Read the full issue|Читать полный выпуск/ })
        ).toHaveCount(0);
        await expect(page.locator('a[href="/unframed/spectral-tiger"]')).toHaveCount(1);

        // Contents is a compact selection: one main story plus at most one
        // material per format, never a duplicate of the cover story.
        const contents = page.locator('#contents');
        const fullIssue = page.locator('#issues [data-role="full-issue"]');
        await expect(fullIssue).toHaveCount(1);
        await expect(contents.locator('[data-role="full-issue"]')).toHaveCount(0);
        await expect(fullIssue).toHaveAttribute(
          'href',
          lang === 'en'
            ? '/en/flow-issues/en-issue-18-2026-11-20'
            : '/flow-issues/ru-issue-26-2026-11-20'
        );
        await expect(fullIssue).toContainText(
          lang === 'en' ? 'Read the full issue' : 'Читать полный выпуск'
        );
        const selectionComesFirst = await contents.evaluate(
          (selection, action) =>
            Boolean(
              selection.compareDocumentPosition(action as Node) & Node.DOCUMENT_POSITION_FOLLOWING
            ),
          await fullIssue.elementHandle()
        );
        expect(selectionComesFirst).toBe(true);

        // The full-issue transition is an editorial text link, not a dark CTA.
        const fullIssueStyle = await fullIssue.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            background: style.backgroundColor,
            color: style.color,
            borderTop: style.borderTopWidth,
          };
        });
        expect(fullIssueStyle.background).toBe('rgba(0, 0, 0, 0)');
        expect(fullIssueStyle.color).not.toBe('rgb(245, 242, 235)');
        expect(Number.parseFloat(fullIssueStyle.borderTop)).toBeGreaterThan(0);

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

        // Formats stay distinct in the browser: text rows have no image,
        // photo and video rows do.
        await expect(contents.locator('[data-material-format="post"] img')).toHaveCount(0);
        await expect(contents.locator('[data-material-format="link"] img')).toHaveCount(0);
        await expect(contents.locator('[data-material-format="photo"] img')).toHaveCount(1);
        await expect(contents.locator('[data-material-format="video"] img')).toHaveCount(1);

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

        // The masthead is the largest type; the cover headline leads the page
        // but stays below it, and the material rows stay clearly smaller.
        const coverSize = await heading.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize)
        );
        const mastheadSize = await page
          .getByRole('heading', { level: 1 })
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
        const materialSize = await contents
          .locator('[data-material-format="post"] h4')
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
        expect(mastheadSize).toBeGreaterThan(coverSize);
        expect(coverSize).toBeGreaterThan(materialSize);

        const archiveTitle = page.locator('#archive li').first();
        await expect(archiveTitle).toBeVisible();
        const archiveSize = await archiveTitle
          .locator('span.font-serif')
          .first()
          .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
        expect(coverSize).toBeGreaterThan(archiveSize);

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
        const images = page.locator('#issues img');
        const imageCount = await images.count();
        expect(imageCount).toBeGreaterThanOrEqual(3);
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

        // The rendered vertical order is issue → main story → selection →
        // full issue, and the page continues into Flow, archive and subscribe.
        const hierarchy = await page.evaluate(() => {
          const topOf = (selector: string) => {
            const element = document.querySelector(selector);
            return element ? element.getBoundingClientRect().top + window.scrollY : Number.NaN;
          };
          return {
            rail: topOf('#current-issue-heading'),
            cover: topOf('[data-role="main-material"]'),
            contents: topOf('#contents'),
            fullIssue: topOf('#full-issue'),
            stream: topOf('#stream'),
            archive: topOf('#archive'),
            subscribe: topOf('#subscribe'),
          };
        });
        expect(hierarchy.rail).toBeLessThan(hierarchy.cover);
        expect(hierarchy.cover).toBeLessThan(hierarchy.contents);
        expect(hierarchy.contents).toBeLessThan(hierarchy.fullIssue);
        expect(hierarchy.fullIssue).toBeLessThan(hierarchy.stream);
        expect(hierarchy.stream).toBeLessThan(hierarchy.archive);
        expect(hierarchy.archive).toBeLessThan(hierarchy.subscribe);

        await scrollToSectionStart(page, '#full-issue');
        await expect(fullIssue).toBeInViewport();
        const fullIssueBox = await fullIssue.boundingBox();
        expect(fullIssueBox?.height ?? 0).toBeGreaterThanOrEqual(40);
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, `${viewport.label}-${lang}-full-issue.png`),
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
