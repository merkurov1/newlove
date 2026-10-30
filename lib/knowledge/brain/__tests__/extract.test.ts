/** @jest-environment node */

import { extractArticle } from '../extract';

function articleHtml(options: { paywall?: boolean; body?: string } = {}): string {
  const body =
    options.body ||
    Array.from({ length: 8 }, (_, index) =>
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
  <footer>Copyright example</footer>
</body>
</html>`;
}

describe('Brain article extraction', () => {
  it('extracts the full article, metadata and structure', () => {
    const article = extractArticle(articleHtml(), 'https://example.com/columns/attention');

    expect(article.status).toBe('ok');
    expect(article.title).toBe('The Architecture of Attention');
    expect(article.author).toBe('Anton Merkurov');
    expect(article.canonicalUrl).toBe('https://example.com/columns/attention');
    expect(article.publishedAt).toBe('2026-05-04T10:00:00.000Z');
    expect(article.wordCount).toBeGreaterThan(80);
    expect(article.blocks.some((block) => block.type === 'heading' && block.text === 'First movement')).toBe(
      true
    );
    expect(article.blocks.some((block) => block.type === 'quote')).toBe(true);
    expect(article.blocks.some((block) => block.type === 'list')).toBe(true);
    expect(article.text).not.toContain('ten other columns');
    expect(article.text).not.toContain('Copyright example');
  });

  it('marks paywalled pages as partial instead of silently indexing them', () => {
    const article = extractArticle(articleHtml({ paywall: true }), 'https://example.com/columns/attention');

    expect(article.status).toBe('partial');
    expect(article.diagnostics.paywallDetected).toBe(true);
  });

  it('marks very short extractions as partial', () => {
    const article = extractArticle(
      articleHtml({ body: '<p>Too short.</p>' }),
      'https://example.com/columns/short'
    );

    expect(article.status).not.toBe('ok');
  });

  it('handles a simple main element without a full article wrapper', () => {
    const html = `<html><head><title>Fallback</title><link rel="canonical" href="https://example.com/f" /></head>
      <body><main><h1>Fallback</h1>${Array.from({ length: 12 }, () =>
        '<p>Fallback paragraph with enough words to be considered real article content rather than navigation or boilerplate.</p>'
      ).join('')}</main></body></html>`;

    const article = extractArticle(html, 'https://example.com/f');

    expect(article.status).toBe('ok');
    expect(article.blocks.length).toBeGreaterThan(2);
  });
});
