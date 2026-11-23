import { expect, test } from '@playwright/test';

/**
 * SEO regression checks against the raw server HTML, without executing client
 * JavaScript. These catch the regression where a `useSearchParams` hook moved
 * the whole Media Archive behind a Suspense fallback: the page still looked
 * correct in a browser, but crawlers received only "Loading media archive…".
 */
test.describe('server-rendered SEO surface', () => {
  test('media archive ships its heading and record links in the initial HTML', async ({
    request,
  }) => {
    const response = await request.get('/media');
    expect(response.status()).toBe(200);

    const html = await response.text();
    expect(html).not.toContain('Loading media archive');
    expect(html).toMatch(/<h1[^>]*class="ma-h1"[^>]*>Public record &amp; commentary<\/h1>/);
    expect(html).toContain('/media/record/');
  });
});
