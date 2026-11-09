/** @jest-environment node */

import {
  domainOf,
  extractContentSlug,
  matchContent,
  normalizePath,
  projectForPath,
  type ContentIndexEntry,
} from '../normalize';

describe('website URL normalization', () => {
  it('normalizes absolute URLs, queries, hashes and trailing slashes', () => {
    expect(normalizePath('https://www.merkurov.love/journal/My-Post/?utm=1#top')).toBe(
      '/journal/my-post'
    );
    expect(normalizePath('/Flow/')).toBe('/flow');
    expect(normalizePath('/')).toBe('/');
    expect(normalizePath('https://merkurov.love')).toBe('/');
    expect(normalizePath('')).toBe('');
  });

  it('decodes percent-encoded paths exactly once', () => {
    expect(normalizePath('/letters/%D0%BF%D0%B8%D1%81%D1%8C%D0%BC%D0%BE')).toBe(
      '/letters/письмо'
    );
  });

  it('maps project paths by boundary, not by substring', () => {
    expect(projectForPath('/flow')?.key).toBe('flow');
    expect(projectForPath('/flow/subscribe')?.key).toBe('flow');
    expect(projectForPath('/flowing-river')).toBeNull();
    expect(projectForPath('/heartandangel')?.key).toBe('heart');
    expect(projectForPath('/journal')?.key).toBe('journal');
    expect(projectForPath('/unframed')?.key).toBe('unframed');
  });

  it('extracts content slugs from known routes', () => {
    expect(extractContentSlug('/journal/my-post')).toEqual({
      type: 'article',
      slug: 'my-post',
    });
    expect(extractContentSlug('/letters/issue-20')).toEqual({
      type: 'letter',
      slug: 'issue-20',
    });
    expect(extractContentSlug('/flow')).toEqual({ type: 'project', slug: 'flow' });
  });

  it('matches content by exact path and content type', () => {
    const index = new Map<string, ContentIndexEntry>();
    const article: ContentIndexEntry = {
      path: '/journal/my-post',
      type: 'article',
      slug: 'my-post',
      title: 'My post',
      url: '/journal/my-post',
      publishedAt: '2026-10-01',
      brainDocumentId: 'doc-1',
    };
    index.set(article.path, article);
    index.set('article:my-post', article);

    expect(matchContent('https://www.merkurov.love/journal/my-post/?x=1', index)).toBe(article);
    expect(matchContent('/journal/other', index)).toBeNull();
  });

  it('derives a referrer domain without inventing traffic', () => {
    expect(domainOf('https://l.facebook.com/')).toBe('l.facebook.com');
    expect(domainOf('https://www.google.com/search?q=x')).toBe('google.com');
    expect(domainOf(null)).toBe('(direct)');
  });
});
