/** @jest-environment node */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from '@jest/globals';

import { GET as getRssAlias } from '@/app/rss.xml/route';
import { pageMetadata } from '@/lib/seo';

type RedirectRule = {
  source: string;
  destination: string;
  permanent?: boolean;
  statusCode?: number;
};

const nextConfig = require('../../../next.config.js') as {
  redirects: () => Promise<RedirectRule[]>;
};

const ORIGIN = 'https://www.merkurov.love';

function request(path: string): Request {
  return new Request(`${ORIGIN}${path}`);
}

function routeFileExists(route: string): boolean {
  return fs.existsSync(path.join(process.cwd(), 'app', route, 'route.ts'));
}

describe('RSS routing', () => {
  it('keeps /feed.xml and /flow/rss as canonical serving routes', async () => {
    const redirects = await nextConfig.redirects();
    const sources = redirects.map((rule) => rule.source);

    expect(sources).not.toContain('/feed.xml');
    expect(sources).not.toContain('/flow/rss');
    expect(sources).not.toContain('/flow/feed.json');
    expect(routeFileExists('feed.xml')).toBe(true);
    expect(routeFileExists('flow/rss')).toBe(true);
  });

  it('advertises the Journal feed by default and the Flow feed on Flow pages', () => {
    const journal = pageMetadata({
      title: 'Journal',
      description: 'Journal feed discovery',
      path: '/journal',
    });
    const flow = pageMetadata({
      title: 'Flow',
      description: 'Flow feed discovery',
      path: '/flow',
      rssPath: '/flow/rss',
      jsonFeedPath: '/flow/feed.json',
    });

    expect(journal.alternates?.types).toMatchObject({
      'application/rss+xml': `${ORIGIN}/feed.xml`,
    });
    expect(flow.alternates?.types).toMatchObject({
      'application/rss+xml': `${ORIGIN}/flow/rss`,
      'application/feed+json': `${ORIGIN}/flow/feed.json`,
    });
  });

  it('keeps /rss.xml as a one-hop alias to the Journal feed', async () => {
    const response = getRssAlias(request('/rss.xml'));

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/feed.xml`);
    expect(response.headers.get('location')).not.toBe(`${ORIGIN}/flow/rss`);
  });

  it('keeps /flow/rss.xml as a serving alias for existing Flow subscribers', async () => {
    const redirects = await nextConfig.redirects();

    expect(redirects.map((rule) => rule.source)).not.toContain('/flow/rss.xml');
    expect(routeFileExists('flow/rss.xml')).toBe(true);
  });

  it('does not create a redirect cycle for the feed aliases', async () => {
    const redirects = new Map<string, string>([
      ['/rss.xml', '/feed.xml'],
      ['/feed', '/flow'],
    ]);

    for (const start of redirects.keys()) {
      const seen = new Set<string>();
      let current = start;

      while (redirects.has(current)) {
        expect(seen.has(current)).toBe(false);
        seen.add(current);
        current = redirects.get(current)!;
      }
    }

    expect(redirects.has('/feed.xml')).toBe(false);
    expect(redirects.has('/flow/rss')).toBe(false);
    expect(redirects.has('/flow/rss.xml')).toBe(false);
  });

  it('keeps the legacy /feed page redirect separate from the feeds', async () => {
    const redirects = await nextConfig.redirects();
    const legacyFeed = redirects.find((rule) => rule.source === '/feed');

    expect(legacyFeed?.destination).toBe('/flow');
    expect(legacyFeed?.permanent).toBe(true);
  });
});
