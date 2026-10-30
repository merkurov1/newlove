/** @jest-environment node */

import { extractArticle } from '../extract';

function longParagraphs(count: number, words = 28): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `<p>Paragraph ${index + 1}. ${Array.from(
        { length: words },
        (_, word) => `word${word + 1}`
      ).join(' ')}.</p>`
  ).join('');
}

function articleHtml(options: { paywall?: boolean; body?: string } = {}): string {
  const body =
    options.body ||
    Array.from(
      { length: 8 },
      (_, index) =>
        `<p>This is paragraph ${index + 1} of a long-form column about art, memory and the architecture of attention. It contains enough prose to pass a real extraction threshold and to preserve the author's argument across several distinct paragraphs.</p>`
    ).join('');

  return `<!doctype html>
<html lang="en">
<head>
  <title>Fallback title</title>
  <link rel="canonical" href="https://example.com/columns/attention?utm_source=feed" />
  <meta property="og:title" content="The Architecture of Attention" />
  <meta name="author" content="Anton Merkurov" />
  <meta property="article:published_time" content="2026-05-04T10:00:00Z" />
  <meta property="og:site_name" content="Example Journal" />
</head>
<body>
  <nav><a href="/">Home</a><a href="/about">About</a></nav>
  <header><h1>The Architecture of Attention</h1></header>
  <article>
    <h2>First movement</h2>
    ${body}
    <blockquote>Attention is a room we build before we know who will enter it.</blockquote>
    <ul><li>First observation</li><li>Second observation</li></ul>
    <h2>Second movement</h2>
    <p>The argument returns to the same room from a different door, asking what changes when the visitor refuses to leave.</p>
    ${options.paywall ? '<p>Subscribe to continue reading this article.</p>' : ''}
  </article>
  <aside class="related">Recommended: ten other columns you must read</aside>
  <div class="cookie-banner">We use cookies to improve your experience.</div>
  <footer>Copyright example</footer>
</body>
</html>`;
}

describe('Brain article extraction', () => {
  it('extracts the full article, metadata and structure', () => {
    const article = extractArticle(articleHtml(), 'https://example.com/columns/attention');

    expect(article.status).toBe('complete');
    expect(article.extractionVersion).toBe('brain-article-extractor-v2');
    expect(article.sourceDomain).toBe('example.com');
    expect(article.title).toBe('The Architecture of Attention');
    expect(article.author).toBe('Anton Merkurov');
    expect(article.canonicalUrl).toBe('https://example.com/columns/attention');
    expect(article.publishedAt).toBe('2026-05-04T10:00:00.000Z');
    expect(article.publishedAtSource).toBe('metadata');
    expect(article.wordCount).toBeGreaterThan(80);
    expect(
      article.blocks.some((block) => block.type === 'heading' && block.text === 'First movement')
    ).toBe(true);
    expect(article.blocks.some((block) => block.type === 'quote')).toBe(true);
    expect(article.blocks.some((block) => block.type === 'list')).toBe(true);
    expect(article.text).not.toContain('ten other columns');
    expect(article.text).not.toContain('Copyright example');
    expect(article.text).not.toContain('We use cookies');
    expect(article.diagnostics.boilerplateRatio).toBeGreaterThan(0);
    expect(article.diagnostics.completeness).toBeGreaterThanOrEqual(0.8);
  });

  it('marks paywalled pages as partial instead of silently indexing them', () => {
    const article = extractArticle(
      articleHtml({ paywall: true }),
      'https://example.com/columns/attention'
    );

    expect(article.status).toBe('partial');
    expect(article.diagnostics.paywallDetected).toBe(true);
  });

  it('marks very short extractions as failed or partial', () => {
    const article = extractArticle(
      articleHtml({ body: '<p>Too short.</p>' }),
      'https://example.com/columns/short'
    );

    expect(['failed', 'partial']).toContain(article.status);
  });

  it('handles a simple main element without a full article wrapper', () => {
    const html = `<html><head><title>Fallback</title><link rel="canonical" href="https://example.com/f" /></head>
      <body><main><h1>Fallback</h1>${Array.from(
        { length: 12 },
        () =>
          '<p>Fallback paragraph with enough words to be considered real article content rather than navigation or boilerplate.</p>'
      ).join('')}</main></body></html>`;

    const article = extractArticle(html, 'https://example.com/f');

    expect(article.status).toBe('complete');
    expect(article.blocks.length).toBeGreaterThan(2);
  });

  it('extracts Novaya Gazeta content and recovers the date from the URL path', () => {
    const html = `<html lang="ru"><head>
      <title>Новая газета</title>
      <link rel="canonical" href="https://novayagazeta.ru/articles/2025/04/26/test-material?utm_source=x" />
      <meta property="og:title" content="Тестовый материал" />
      <meta property="og:site_name" content="Новая газета" />
    </head><body>
      <nav>Главная Политика Экономика</nav>
      <article>
        <h1>Тестовый материал</h1>
        <div class="article__meta">26 апреля 2025</div>
        <div class="article__body">
          <h2>Первый раздел</h2>
          ${longParagraphs(10)}
          <blockquote>Это цитата, которая должна сохраниться в тексте.</blockquote>
          <h2>Второй раздел</h2>
          ${longParagraphs(6)}
        </div>
        <div class="article__social">Поделиться</div>
        <div class="article__related">Читайте также</div>
      </article>
      <footer>© Новая газета</footer>
    </body></html>`;

    const article = extractArticle(
      html,
      'https://novayagazeta.ru/articles/2025/04/26/test-material'
    );

    expect(article.publishedAt).toBe('2025-04-26T00:00:00.000Z');
    expect(article.publishedAtSource).toBe('url_path');
    expect(article.sourceDomain).toBe('novayagazeta.ru');
    expect(article.status).toBe('complete');
    expect(article.text).toContain('Это цитата');
    expect(article.text).not.toContain('Поделиться');
    expect(article.text).not.toContain('Читайте также');
  });

  it('extracts Substack editorial content without subscription and share widgets', () => {
    const html = `<html lang="en"><head>
      <title>Substack post</title>
      <link rel="canonical" href="https://example.substack.com/p/post" />
      <meta property="og:title" content="A Substack Essay" />
      <meta property="article:published_time" content="2025-01-02T00:00:00Z" />
    </head><body>
      <div class="post-header"><h1>A Substack Essay</h1><p>Subscribe to receive new posts.</p></div>
      <div class="available-content">
        <h2>Opening</h2>
        ${longParagraphs(10)}
        <p>This is the actual editorial conclusion.</p>
      </div>
      <div class="subscription-widget-wrap">Subscribe now</div>
      <div class="post-footer">Share this post</div>
    </body></html>`;

    const article = extractArticle(html, 'https://example.substack.com/p/post');

    expect(article.status).toBe('complete');
    expect(article.text).toContain('actual editorial conclusion');
    expect(article.text).not.toContain('Subscribe now');
    expect(article.text).not.toContain('Share this post');
    expect(article.text).not.toContain('Subscribe to receive new posts');
  });

  it('marks structurally weak but long text as needs_review', () => {
    const html = `<html><head><title>Review me</title></head><body><article>
      ${longParagraphs(3, 55)}
    </article></body></html>`;

    const article = extractArticle(html, 'https://example.com/review');

    expect(article.status).toBe('needs_review');
    expect(article.diagnostics.completeness).toBeLessThan(0.8);
  });

  it('does not guess a date when the URL has no verifiable Novaya date', () => {
    const html = `<html lang="ru"><head>
      <title>Новая газета</title>
      <link rel="canonical" href="https://novayagazeta.ru/articles/no-date" />
      <meta property="og:title" content="Без даты" />
    </head><body><article><h1>Без даты</h1>${longParagraphs(8)}</article></body></html>`;

    const article = extractArticle(html, 'https://novayagazeta.ru/articles/no-date');

    expect(article.publishedAt).toBeNull();
    expect(article.publishedAtSource).toBeNull();
  });
});
