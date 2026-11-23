import {
  buildDynamicSitemapEntries,
  buildSitemapEntries,
  buildStaticSitemapEntries,
  isCanonicalSitemapUrl,
  parseLastModified,
} from '../sitemap/entries';

const SITE = 'https://www.merkurov.love';

describe('sitemap lastModified', () => {
  it('omits unknown, empty, invalid and GSC placeholder dates', () => {
    expect(parseLastModified(undefined)).toBeUndefined();
    expect(parseLastModified(null)).toBeUndefined();
    expect(parseLastModified('')).toBeUndefined();
    expect(parseLastModified('not-a-date')).toBeUndefined();
    expect(parseLastModified('1970-01-01T00:00:00.000Z')).toBeUndefined();
  });

  it('keeps a real recent date exactly as provided', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(parseLastModified(yesterday)).toBe(yesterday);
  });

  it('drops dates in the future instead of advertising an impossible lastmod', () => {
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(parseLastModified(nextYear)).toBeUndefined();
    expect(parseLastModified('2999-01-01T00:00:00.000Z')).toBeUndefined();
  });

  it('drops a future dynamic-record lastmod from the sitemap entry', () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const [entry] = buildDynamicSitemapEntries({
      articles: [{ slug: 'future-article', updatedAt: future }],
    });

    expect(entry.url).toBe(`${SITE}/future-article`);
    expect(entry.lastModified).toBeUndefined();
  });

  it('does not put a generation timestamp on static routes', () => {
    const before = Date.now();
    const entries = buildStaticSitemapEntries();
    const after = Date.now();

    expect(entries.length).toBeGreaterThan(10);
    for (const entry of entries) {
      expect(entry.lastModified).toBeUndefined();
    }

    // Guard against a future re-introduction of `new Date()` in the builder.
    expect(before).toBeLessThanOrEqual(after);
  });

  it('omits lastModified for a dynamic record without a known date', () => {
    const entries = buildDynamicSitemapEntries({
      articles: [{ slug: 'no-date-article' }],
      flowItems: [
        { slug: 'no-date-flow', status: 'published', visibility: 'public' },
      ],
      tags: [{ slug: 'auction' }],
    });

    expect(entries.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        `${SITE}/no-date-article`,
        `${SITE}/flow/no-date-flow`,
        `${SITE}/tags/auction`,
      ])
    );
    for (const entry of entries) {
      expect(entry.lastModified).toBeUndefined();
    }
  });
});

describe('sitemap URL inventory rules', () => {
  it('emits only canonical absolute HTTPS www URLs without query or hash', () => {
    const entries = buildSitemapEntries({
      articles: [{ slug: 'article', updatedAt: '2026-10-10T00:00:00.000Z' }],
      media: [{ slug: 'media-record', date: '2026-10-10' }],
    });

    expect(entries.length).toBeGreaterThan(20);
    for (const entry of entries) {
      expect(entry.url.startsWith(`${SITE}/`) || entry.url === SITE).toBe(true);
      expect(isCanonicalSitemapUrl(entry.url)).toBe(true);
    }
  });

  it('rejects redirecting, non-canonical static routes', () => {
    const urls = buildStaticSitemapEntries().map((entry) => entry.url);

    expect(urls).not.toContain(`${SITE}/letters`);
    expect(urls).not.toContain(`${SITE}/stat`);
    expect(urls).not.toContain(`${SITE}/projects`);
    expect(urls).not.toContain(`${SITE}/feed`);
  });

  it('does not duplicate URLs already emitted by a static route', () => {
    const entries = buildSitemapEntries({
      articles: [{ slug: 'lobby' }],
      tags: [{ slug: 'lobby' }],
    });

    const lobby = entries.filter((entry) => entry.url === `${SITE}/lobby`);
    expect(lobby).toHaveLength(1);
  });

  it('always contains the root and the translated section URLs', () => {
    const urls = buildStaticSitemapEntries().map((entry) => entry.url);

    expect(urls).toContain(`${SITE}/`);
    expect(urls).toContain(`${SITE}/advising`);
    expect(urls).toContain(`${SITE}/ru/advising`);
    expect(urls).toContain(`${SITE}/de/advising`);
    expect(urls).toContain(`${SITE}/fr/advising`);
    expect(urls).toContain(`${SITE}/ar/advising`);
    expect(urls).toContain(`${SITE}/ru/heritage`);
    expect(urls).not.toContain(`${SITE}/ar/heritage`);
  });
});

describe('dynamic sitemap sources', () => {
  it('includes only published, public Flow items with a valid slug', () => {
    const entries = buildDynamicSitemapEntries({
      flowItems: [
        { slug: 'published', status: 'published', visibility: 'public' },
        { slug: 'draft', status: 'draft', visibility: 'public' },
        { slug: 'private', status: 'published', visibility: 'private' },
        { slug: '', status: 'published', visibility: 'public' },
        { slug: '   ', status: 'published', visibility: 'public' },
        { status: 'published', visibility: 'public' },
      ],
    });

    expect(entries.map((entry) => entry.url)).toEqual([`${SITE}/flow/published`]);
  });

  it('encodes non-latin Flow slugs without losing the slug', () => {
    const slug = 'американец-которого-посадили-за-шпионаж';
    const [entry] = buildDynamicSitemapEntries({
      flowItems: [{ slug, status: 'published', visibility: 'public' }],
    });

    expect(entry.url).toBe(`${SITE}/flow/${encodeURIComponent(slug)}`);
    expect(decodeURIComponent(entry.url.split('/flow/')[1])).toBe(slug);
  });

  it('routes issue letters to their content-language canonical path', () => {
    const entries = buildDynamicSitemapEntries({
      letters: [
        { slug: 'ru-issue', kind: 'issue', lang: 'ru', status: 'published', published: true },
        { slug: 'en-issue', kind: 'issue', lang: 'en', status: 'published', published: true },
        { slug: 'draft-issue', kind: 'issue', lang: 'en', status: 'draft', published: true },
        { slug: 'journal-post', kind: 'letter', published: true },
        { slug: 'draft-letter', kind: 'letter', published: false },
      ],
    });

    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain(`${SITE}/flow-issues/ru-issue`);
    expect(urls).toContain(`${SITE}/en/flow-issues/en-issue`);
    expect(urls).not.toContain(`${SITE}/en/flow-issues/draft-issue`);
    expect(urls).toContain(`${SITE}/journal/journal-post`);
    expect(urls).not.toContain(`${SITE}/journal/draft-letter`);
  });

  it('requires a real tag slug instead of falling back to the display name', () => {
    const entries = buildDynamicSitemapEntries({
      tags: [{ slug: 'auction', name: 'Auction' }, { name: 'No slug' }, { slug: ' ' }],
    });

    expect(entries.map((entry) => entry.url)).toEqual([`${SITE}/tags/auction`]);
  });

  it('includes only published lots', () => {
    const entries = buildDynamicSitemapEntries({
      lots: [
        { id: '7b38bd28-2af9-4da6-b4f6-572173041b75', status: 'published' },
        { id: 'draft-lot', status: 'draft' },
      ],
    });

    expect(entries.map((entry) => entry.url)).toEqual([
      `${SITE}/lots/7b38bd28-2af9-4da6-b4f6-572173041b75`,
    ]);
  });

  it('uses media publication dates and drops unknown/placeholder dates', () => {
    const entries = buildDynamicSitemapEntries({
      media: [
        { slug: 'dated-record', date: '2024-04-02' },
        { slug: 'undated-record', date: '1900' },
      ],
    });

    expect(entries).toHaveLength(2);
    expect(entries[0].lastModified).toBe('2024-04-02T00:00:00.000Z');
    expect(entries[1].lastModified).toBeUndefined();
  });
});
