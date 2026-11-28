/** @jest-environment node */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';
import { load } from 'cheerio';

const template = readFileSync(
  path.resolve(__dirname, '../../../telegram/instant-view/merkurov.love.iv'),
  'utf8'
);

function page({
  title,
  body,
  description = 'Flow post description',
  image = 'https://cdn.example.com/og.jpg',
}: {
  title: string;
  body: string;
  description?: string;
  image?: string;
}) {
  return `<!doctype html>
<html lang="ru">
  <head>
    <title>${title} | Anton Merkurov</title>
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:image" content="${image}" />
    <meta property="og:site_name" content="Anton Merkurov" />
    <meta property="article:published_time" content="2026-11-28T07:10:27.959Z" />
  </head>
  <body>
    <header class="site-header"><a href="/">Anton Merkurov</a></header>
    <main>
      <article
        class="flow-item"
        data-flow-item="test-slug"
        data-flow-title="${title}"
        data-flow-author="Anton Merkurov"
        data-flow-published="2026-11-28T07:10:27.959Z"
      >
        <header class="flow-reader__bar">
          <a href="/flow">← Flow</a>
          <button>Reader controls</button>
        </header>
        <div class="flow-reader__meta">
          <span>Note</span><span>·</span>
          <time datetime="2026-11-28T07:10:27.959Z">28 Nov 2026</time>
        </div>
        <div class="flow-item__hero" data-flow-hero>
          ${body}
        </div>
        <footer class="flow-reader__footer">
          <button>Share</button>
          <nav class="flow-reader__pager"><a href="/flow/newer">Newer</a></nav>
          <div class="flow-reader__sources"><a href="https://t.me/unframed_am">Telegram ↗</a></div>
        </footer>
        <section>
          <span>Pierrot</span><span>Context Architecture</span>
          <p>Private AI commentary</p>
        </section>
      </article>
    </main>
  </body>
</html>`;
}

const cases = [
  {
    name: 'text-only note',
    expectedTitle: 'A text-only note',
    body: `<h1>A text-only note</h1>
      <div class="flow-item__body"><p>First paragraph.</p><p>Second paragraph.</p></div>`,
    check($: ReturnType<typeof load>) {
      expect($('[data-flow-hero]').text()).toContain('First paragraph.');
      expect($('[data-flow-hero]').text()).toContain('Second paragraph.');
    },
  },
  {
    name: 'Markdown article with links',
    expectedTitle: 'Markdown article',
    body: `<h1>Markdown article</h1>
      <div class="flow-item__body">
        <h2>Section one</h2>
        <p><strong>Bold</strong> and <em>italic</em> and <a href="https://example.com/source">a link</a>.</p>
        <blockquote><p>Quoted line.</p></blockquote>
        <ul><li>First item</li><li>Second item</li></ul>
        <pre><code>const value = 1;</code></pre>
      </div>`,
    check($: ReturnType<typeof load>) {
      expect($('[data-flow-hero] h2').text()).toBe('Section one');
      expect($('[data-flow-hero] blockquote').text()).toContain('Quoted line.');
      expect($('[data-flow-hero] ul li')).toHaveLength(2);
      expect($('[data-flow-hero] pre').text()).toContain('const value = 1;');
      expect($('[data-flow-hero] a[href="https://example.com/source"]')).toHaveLength(1);
    },
  },
  {
    name: 'image post with caption',
    expectedTitle: 'Image post',
    body: `<h1>Image post</h1>
      <figure>
        <a data-flow-image data-flow-image-src="https://cdn.example.com/photo.jpg" href="https://cdn.example.com/photo.jpg">
          <img src="https://cdn.example.com/photo.jpg" alt="A caption" />
        </a>
        <figcaption>A caption</figcaption>
      </figure>`,
    check($: ReturnType<typeof load>) {
      const imageLink = $('[data-flow-hero] a[data-flow-image]');
      expect(imageLink).toHaveLength(1);
      expect(imageLink.attr('href')).toBe('https://cdn.example.com/photo.jpg');
      expect(imageLink.find('img').attr('src')).toBe('https://cdn.example.com/photo.jpg');
      expect($('[data-flow-hero] figcaption').text()).toBe('A caption');
    },
  },
  {
    name: 'link-containing post',
    expectedTitle: 'My Flow title',
    body: `<h1>My Flow title</h1>
      <div class="flow-item__body"><p>Commentary about the link.</p></div>
      <div class="flow-links">
        <a data-link-kind="external" href="https://example.com/linked-article">
          <span>Linked page OG title</span>
          <span>example.com</span>
        </a>
      </div>`,
    check($: ReturnType<typeof load>) {
      expect($('[data-flow-hero] a[href="https://example.com/linked-article"]')).toHaveLength(1);
      expect($('[data-flow-hero]').text()).toContain('Commentary about the link.');
      expect($('[data-flow-hero]').text()).toContain('Linked page OG title');
    },
  },
  {
    name: 'video / supported media',
    expectedTitle: 'Video post',
    body: `<figure>
        <div><div class="aspect-video">
          <iframe src="https://www.youtube.com/embed/abc123def45" title="YouTube video"></iframe>
        </div></div>
        <figcaption>Watch on YouTube</figcaption>
      </figure>
      <h1>Video post</h1>
      <div class="flow-item__body"><p>Video description.</p></div>`,
    check($: ReturnType<typeof load>) {
      expect($('[data-flow-hero] iframe').attr('src')).toContain('youtube.com/embed/');
      expect($('[data-flow-hero]').text()).toContain('Video description.');
    },
  },
];

describe('Flow Instant View template contract', () => {
  it('targets version 2.1 and only public Flow post articles', () => {
    expect(template).toMatch(/^~version: "2\.1"$/m);
    expect(template).toContain('?path: /flow/[^/]+/?$');
    expect(template).toContain('!exists: //article[@data-flow-item]');
  });

  it('uses the Flow title before any Open Graph fallback', () => {
    const dataTitle = template.indexOf('@data-flow-title');
    const articleTitle = template.indexOf('title: $title');
    const ogTitle = template.indexOf('meta[@property="og:title"]');

    expect(dataTitle).toBeGreaterThan(-1);
    expect(articleTitle).toBeGreaterThan(dataTitle);
    expect(ogTitle).toBeGreaterThan(articleTitle);
    expect(template).not.toMatch(/title:\s*\$body.*link/i);
  });

  it('takes only the Flow hero as the body and never falls back to the page', () => {
    expect(template).toContain('$body: $article//*[@data-flow-hero]');
    expect(template).toContain('body: $body');
    expect(template).toContain('$body: $article//*[has-class("flow-item__hero")]');
    expect(template).not.toMatch(/^body:\s*\/\/body\s*$/m);
    expect(template).not.toMatch(/^body:\s*\$article\s*$/m);
  });

  it('removes app chrome, share controls and Pierrot context', () => {
    expect(template).toContain('flow-reader__bar');
    expect(template).toContain('flow-reader__meta');
    expect(template).toContain('flow-reader__controls');
    expect(template).toContain('flow-reader__footer');
    expect(template).toContain('flow-reader__pager');
    expect(template).toContain('flow-reader__sources');
    expect(template).toContain('flow-reader__share');
    expect(template).toContain('flow-home-screen');
  });

  it('converts click-through image anchors into direct IV images', () => {
    expect(template).toContain('$image_links: $body//a[@data-flow-image]');
    expect(template).toContain('@before(<img>');
    expect(template).toContain('href, @href');
    expect(template).toContain('@remove: $image_links');
  });

  it.each(cases)('extracts $name from the rendered page contract', (item) => {
    const html = page({ title: item.expectedTitle, body: item.body });
    const $ = load(html);

    const article = $('article[data-flow-item]');
    expect(article).toHaveLength(1);
    expect(article.attr('data-flow-title')).toBe(item.expectedTitle);

    const hero = article.find('[data-flow-hero]');
    expect(hero).toHaveLength(1);
    expect(hero.text()).not.toContain('← Flow');
    expect(hero.text()).not.toContain('Reader controls');
    expect(hero.text()).not.toContain('Share');
    expect(hero.text()).not.toContain('Newer');
    expect(hero.text()).not.toContain('Pierrot');
    expect(hero.text()).not.toContain('Private AI commentary');

    item.check($);
  });

  it('does not use the linked page title as the Flow post title', () => {
    const item = cases.find((entry) => entry.name === 'link-containing post')!;
    const $ = load(page({ title: item.expectedTitle, body: item.body }));

    expect($('article[data-flow-item]').attr('data-flow-title')).toBe('My Flow title');
    expect($('article[data-flow-item]').attr('data-flow-title')).not.toBe('Linked page OG title');
    expect($('[data-flow-hero]').text()).toContain('Linked page OG title');
  });
});
