import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const ARTIFACT_DIR = path.resolve(process.cwd(), 'artifacts/flow-link-cards');

const ITEMS = [
  {
    id: 'telegram-post',
    title: 'A note from Telegram',
    slug: 'telegram-post',
    lang: 'en',
    type: 'note',
    contentType: 'note',
    status: 'published',
    visibility: 'public',
    showTitle: true,
    bodyExcerpt: 'A short note that points to the channel post.',
    published_at: '2026-11-27T14:00:00.000Z',
    images: [],
    videos: [],
    links: [
      {
        url: 'https://t.me/unframed_am/42',
        title: 'The channel post',
        description: null,
        image: null,
        siteName: 'Telegram',
        domain: 't.me',
        inBody: false,
      },
    ],
  },
  {
    id: 'internal-post',
    title: 'A note with an internal link',
    slug: 'internal-post',
    lang: 'en',
    type: 'note',
    contentType: 'note',
    status: 'published',
    visibility: 'public',
    showTitle: true,
    bodyExcerpt: 'This link stays inside merkurov.love.',
    published_at: '2026-11-27T10:00:00.000Z',
    images: [],
    videos: [],
    links: [
      {
        url: 'https://www.merkurov.love/flow/internal-note',
        title: 'An internal note',
        description: null,
        image: null,
        siteName: null,
        domain: 'merkurov.love',
        inBody: false,
      },
    ],
  },
  {
    id: 'external-post',
    title: 'A note with an external link',
    slug: 'external-post',
    lang: 'en',
    type: 'link',
    contentType: 'link',
    status: 'published',
    visibility: 'public',
    showTitle: true,
    bodyExcerpt: 'The external preview keeps its existing card.',
    published_at: '2026-11-26T18:00:00.000Z',
    images: [],
    videos: [],
    links: [
      {
        url: 'https://example.com/article',
        title: 'An external article',
        description: 'The existing neutral preview.',
        image: null,
        siteName: 'Example',
        domain: 'example.com',
        inBody: false,
      },
    ],
  },
];

async function mockFlow(page: import('@playwright/test').Page) {
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === '/api/flow/items') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: ITEMS, hasMore: false }),
      });
      return;
    }

    if (url.pathname === '/api/admin/items/list') {
      await route.fulfill({ status: 401, contentType: 'application/json', body: '{}' });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{}',
    });
  });
}

test.describe('Flow link cards', () => {
  test.beforeAll(() => {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  });

  for (const viewport of [
    { label: 'mobile-390x844', width: 390, height: 844 },
    { label: 'desktop-1440x900', width: 1440, height: 900 },
  ]) {
    test(`shows three distinct link families at ${viewport.label}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await mockFlow(page);
      await page.goto('/flow');

      await expect(page.getByText('A note from Telegram')).toBeVisible();

      const telegram = page.locator('[data-link-kind="telegram"]');
      const internal = page.locator('[data-link-kind="internal"]');
      const external = page.locator('[data-link-kind="external"]');

      await expect(telegram).toHaveCount(1);
      await expect(internal).toHaveCount(1);
      await expect(external).toHaveCount(1);

      await expect(telegram).toHaveAttribute('href', 'https://t.me/unframed_am/42');
      await expect(telegram).toHaveAttribute('target', '_blank');
      await expect(internal).toHaveAttribute('href', '/flow/internal-note');
      await expect(internal).not.toHaveAttribute('target', '_blank');
      await expect(external.locator('a[href="https://example.com/article"]')).toHaveAttribute(
        'target',
        '_blank'
      );

      const markers = page.locator('.flow-entry__date');
      await expect(markers).toHaveCount(2);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, `${viewport.label}.png`),
        fullPage: true,
      });
    });
  }
});
