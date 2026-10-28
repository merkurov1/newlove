/**
 * @jest-environment node
 */

import { getCachedFlowFeedItems } from '@/lib/flow/items-cash';
import { handleJsonFeedRequest, handleRssRequest } from '../feedRoute';

jest.mock('@/lib/flow/items-cash', () => ({
  getCachedFlowFeedItems: jest.fn(),
}));

jest.mock('@/lib/flow/markdown', () => ({
  markdownToHtml: (markdown: string) => `<p>${markdown}</p>`,
}));

const mockedFeedItems = getCachedFlowFeedItems as jest.MockedFunction<
  typeof getCachedFlowFeedItems
>;

function rawItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Заметка о памяти',
    slug: 'pamyat',
    lang: 'ru',
    type: 'note',
    body_md: 'Первая строка.',
    source_url: null,
    metadata: {},
    published_at: '2026-10-28T09:00:00.000Z',
    updated_at: '2026-10-28T10:00:00.000Z',
    created_at: '2026-10-28T08:00:00.000Z',
    ...overrides,
  };
}

function request(path: string, headers?: Record<string, string>): Request {
  return new Request(`https://www.merkurov.love${path}`, { headers });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedFeedItems.mockResolvedValue({ items: [rawItem()] });
});

describe('handleRssRequest', () => {
  it('serves RSS with query-aware self link and cache headers', async () => {
    const response = await handleRssRequest(request('/flow/rss?lang=ru&limit=2'));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/rss+xml; charset=utf-8');
    expect(response.headers.get('cache-control')).toContain('s-maxage=1800');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('etag')).toMatch(/^W\/"[a-f0-9]+"$/);
    expect(response.headers.get('last-modified')).toBe('Wed, 28 Oct 2026 10:00:00 GMT');

    // The limit and language are forwarded to the cached data loader and
    // reflected in the canonical self link.
    expect(mockedFeedItems).toHaveBeenCalledWith(2, 'ru');
    expect(body).toContain(
      '<atom:link href="https://www.merkurov.love/flow/rss?lang=ru&amp;limit=2"'
    );
    expect(body).toContain('<language>ru</language>');
    expect(body).toContain('<title>Заметка о памяти</title>');
    expect(body).toContain('<guid isPermaLink="false">');
  });

  it('clamps an oversized limit before hitting the database', async () => {
    await handleRssRequest(request('/flow/rss?limit=9999'));

    expect(mockedFeedItems).toHaveBeenCalledWith(100, null);
  });

  it('returns 304 for a matching weak ETag', async () => {
    const first = await handleRssRequest(request('/flow/rss'));
    const etag = first.headers.get('etag') ?? '';
    await first.text();

    const second = await handleRssRequest(request('/flow/rss', { 'if-none-match': etag }));

    expect(second.status).toBe(304);
    expect(await second.text()).toBe('');
  });

  it('returns 304 for If-Modified-Since when nothing changed', async () => {
    const response = await handleRssRequest(
      request('/flow/rss', {
        'if-modified-since': 'Wed, 28 Oct 2026 10:00:00 GMT',
      })
    );

    expect(response.status).toBe(304);
  });

  it('ignores If-Modified-Since when If-None-Match is present', async () => {
    const response = await handleRssRequest(
      request('/flow/rss', {
        'if-none-match': 'W/"stale"',
        'if-modified-since': 'Wed, 28 Oct 2026 10:00:00 GMT',
      })
    );

    expect(response.status).toBe(200);
  });

  it('responds with a no-store 503 when the data layer fails', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    mockedFeedItems.mockRejectedValueOnce(new Error('db down'));

    const response = await handleRssRequest(request('/flow/rss'));

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('retry-after')).toBe('300');
    expect(await response.text()).toContain('temporarily unavailable');
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});

describe('handleJsonFeedRequest', () => {
  it('serves JSON Feed 1.1 with its own self link', async () => {
    const response = await handleJsonFeedRequest(request('/flow/feed.json?limit=1'));
    const feed = JSON.parse(await response.text());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/feed+json; charset=utf-8');
    expect(feed.version).toBe('https://jsonfeed.org/version/1.1');
    expect(feed.feed_url).toBe('https://www.merkurov.love/flow/feed.json?limit=1');
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0].id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('returns 503 when the feed cannot be loaded', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockedFeedItems.mockRejectedValueOnce(new Error('db down'));

    const response = await handleJsonFeedRequest(request('/flow/feed.json'));

    expect(response.status).toBe(503);
  });
});
