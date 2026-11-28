import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';

const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts/flow-pierrot-reader');

const VIEWPORTS = [
  { label: 'desktop', width: 1280, height: 900 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'mobile-390', width: 390, height: 844 },
];

const EN_SIGNATURE = 'reading discipline';
const RU_SIGNATURE = 'дисциплина чтения';

fs.mkdirSync(ARTIFACT_DIR, { recursive: true });

async function hideDevOverlay(page: Page) {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
}

async function mockImages(page: Page) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <rect width="1200" height="900" fill="#e8e2d8"/>
      <rect x="120" y="140" width="420" height="620" fill="#f4efe6"/>
      <circle cx="820" cy="300" r="90" fill="#c8beb0" opacity="0.7"/>
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

async function openReader(page: Page, slug: string) {
  await mockImages(page);
  await page.goto(`/flow/${encodeURIComponent(slug)}`);
  await expect(page.locator('article.flow-item')).toBeVisible();
}

async function readComposition(page: Page) {
  return page.evaluate(() => {
    const selectors = [
      '.flow-item__hero',
      '[data-flow-pierrot]',
      '.flow-reader__share',
      '.flow-reader__sources',
      '.flow-reader__pager',
    ];
    const nodes = selectors.map((selector) => document.querySelector<HTMLElement>(selector));
    const article = document.querySelector<HTMLElement>('article.flow-item');
    const comment = document.querySelector<HTMLElement>('[data-flow-pierrot]');
    const commentBody = document.querySelector<HTMLElement>('[data-flow-pierrot-body]');
    const bodyParagraph = document.querySelector<HTMLElement>(
      '.flow-item__hero .flow-item__body p'
    );
    const commentParagraph = document.querySelector<HTMLElement>('[data-flow-pierrot-body] p');

    const computed = (node: HTMLElement | null) => {
      if (!node) return null;
      const style = getComputedStyle(node);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        color: style.color,
      };
    };

    return {
      documentOrder: selectors.map((selector, index) => {
        const node = nodes[index];
        const previous = nodes[index - 1];

        return {
          selector,
          exists: Boolean(node),
          followsPrevious:
            index === 0 || !node || !previous
              ? index === 0
              : Boolean(previous.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING),
        };
      }),
      article: article?.getBoundingClientRect().toJSON() ?? null,
      comment: comment?.getBoundingClientRect().toJSON() ?? null,
      commentBody: commentBody?.getBoundingClientRect().toJSON() ?? null,
      bodyScrollWidth: commentBody?.scrollWidth ?? 0,
      bodyClientWidth: commentBody?.clientWidth ?? 0,
      paneCount: document.querySelectorAll('[data-flow-pierrot-body]').length,
      language: commentBody?.dataset.language ?? null,
      bodyType: computed(bodyParagraph),
      commentType: computed(commentParagraph),
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

for (const viewport of VIEWPORTS) {
  test(`${viewport.label} keeps the Pierrot comment inside the reader column`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openReader(page, 'the-quiet-index');

    const comment = page.locator('[data-flow-pierrot]');
    await expect(comment).toBeVisible();
    await expect(page.locator('[data-flow-pierrot-body]')).toHaveCount(1);
    await expect(page.getByRole('group', { name: 'Pierrot comment language' })).toBeVisible();

    const composition = await readComposition(page);

    expect(composition.documentOrder.map((entry) => entry.exists)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(
      composition.documentOrder.map((entry) => entry.followsPrevious),
      'hero → comment → share → sources → pager'
    ).toEqual([true, true, true, true, true]);

    expect(composition.pageOverflow).toBeLessThanOrEqual(1);
    expect(composition.paneCount).toBe(1);
    expect(composition.language).toBe('en');
    expect(composition.bodyScrollWidth).toBeLessThanOrEqual(composition.bodyClientWidth + 1);

    expect(composition.article).not.toBeNull();
    expect(composition.comment).not.toBeNull();
    expect(composition.commentBody).not.toBeNull();
    expect(composition.comment!.left).toBeGreaterThanOrEqual(composition.article!.left - 1);
    expect(composition.comment!.right).toBeLessThanOrEqual(composition.article!.right + 1);
    expect(composition.commentBody!.right).toBeLessThanOrEqual(composition.article!.right + 1);

    // The note uses the same serif, measure and reading colour as the body.
    expect(composition.commentType).toEqual(composition.bodyType);

    await expect(page.locator('[data-flow-pierrot-body]')).toContainText(EN_SIGNATURE);
    await expect(page.locator('[data-flow-pierrot-body]')).not.toContainText(RU_SIGNATURE);

    await hideDevOverlay(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, `${viewport.label}.png`),
      fullPage: true,
    });
  });
}

test('switches the comment between EN and RU without stacking both', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openReader(page, 'the-quiet-index');

  const commentBody = page.locator('[data-flow-pierrot-body]');
  const language = page.getByRole('group', { name: 'Pierrot comment language' });

  await expect(language.getByRole('button', { name: 'EN' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(commentBody).toHaveCount(1);
  await expect(commentBody).toContainText(EN_SIGNATURE);
  await expect(commentBody).not.toContainText(RU_SIGNATURE);
  await expect(commentBody.locator('a')).toHaveAttribute('href', 'https://example.com/quiet-index');
  await expect(commentBody.locator('pre code')).toContainText("index.keep('the hour')");
  await expect(commentBody.locator('table')).toHaveCount(1);
  await expect(page.getByText('Двуязычно')).toHaveCount(0);

  await language.getByRole('button', { name: 'RU' }).click();

  await expect(commentBody).toHaveAttribute('data-language', 'ru');
  await expect(commentBody).toContainText(RU_SIGNATURE);
  await expect(commentBody).not.toContainText(EN_SIGNATURE);
  await expect(page.locator('[data-flow-pierrot-body]')).toHaveCount(1);

  await hideDevOverlay(page);
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, 'mobile-390-ru.png'),
    fullPage: true,
  });
});

test('renders the real Pierrot portrait and no technical chrome', async ({ page }) => {
  await openReader(page, 'the-quiet-index');

  const avatar = page.locator('[data-pierrot-avatar] img');
  await expect(avatar).toHaveAttribute('src', '/pierrot/pierrot-avatar-512.jpg');
  await expect(avatar).toHaveJSProperty('complete', true);
  expect(await avatar.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  await expect(page.locator('.flow-pierrot__name')).toHaveText('Pierrot');
  await expect(page.locator('.pw-avatar-fallback')).toHaveCount(0);
  await expect(page.getByText('Context Architecture')).toHaveCount(0);
  await expect(page.getByText('Digital shadow & advisor')).toHaveCount(0);
  await expect(page.getByText('PIERROT EDITORIAL')).toHaveCount(0);
});

test('keeps photo and no-context items free of the comment block', async ({ page }) => {
  await openReader(page, 'photo-study');
  await expect(page.locator('[data-flow-pierrot]')).toHaveCount(0);
  await expect(page.locator('.flow-reader__share')).toBeVisible();

  await openReader(page, 'reader-with-images');
  await expect(page.locator('[data-flow-pierrot]')).toHaveCount(0);
  await expect(page.locator('.flow-reader__share')).toBeVisible();
});
