/** @jest-environment node */

import { extractArticle } from '@/lib/knowledge/brain/extract';

const paragraph =
  'The article body keeps the argument, the evidence and the reporting together in a clear sequence. ';
const longBody = paragraph.repeat(30);

describe('Media extraction on common publishing patterns', () => {
  it('keeps WordPress entry content and removes navigation, cookies and footer', () => {
    const html = `<html lang="en"><head>
      <title>WordPress article</title>
      <meta property="og:description" content="A WordPress description." />
      <meta property="og:image" content="/images/cover.jpg" />
      <link rel="canonical" href="https://example.com/wordpress-article" />
    </head><body>
      <nav>Navigation that must disappear</nav>
      <div class="cookie-banner">We use cookies</div>
      <article><h1>WordPress article</h1>
        <p>${longBody}</p>
        <p>${longBody}</p>
        <p>${longBody}</p>
      </article>
      <footer>Footer that must disappear</footer>
    </body></html>`;

    const article = extractArticle(html, 'https://example.com/wordpress-article');

    expect(article.text).toContain('The article body keeps the argument');
    expect(article.text).not.toContain('Navigation that must disappear');
    expect(article.text).not.toContain('We use cookies');
    expect(article.text).not.toContain('Footer that must disappear');
    expect(article.description).toBe('A WordPress description.');
    expect(article.imageUrl).toBe('https://example.com/images/cover.jpg');
  });

  it('uses schema.org articleBody when the visible body is not usable', () => {
    const html = `<html lang="en"><head>
      <title>JSON-LD article</title>
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: 'JSON-LD article',
        datePublished: '2026-10-13T10:00:00Z',
        articleBody: `${longBody}\n\n${longBody}`,
      })}</script>
    </head><body><div id="app"></div></body></html>`;

    const article = extractArticle(html, 'https://example.com/jsonld');

    expect(article.text).toContain('The article body keeps the argument');
    expect(article.publishedAt).toContain('2026-10-13');
  });

  it('detects French paywall language without trying to bypass it', () => {
    const html = `<html lang="fr"><head><title>Article réservé</title></head>
      <body><article><p>Cet article est réservé aux abonnés.</p></article></body></html>`;

    const article = extractArticle(html, 'https://example.com/fr');

    expect(article.language).toBe('fr');
    expect(article.diagnostics.paywallDetected).toBe(true);
    expect(article.status).not.toBe('complete');
  });
});
