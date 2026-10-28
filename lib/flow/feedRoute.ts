import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getCachedFlowFeedItems } from '@/lib/flow/items-cash';
import { markdownToHtml } from '@/lib/flow/markdown';
import {
  FLOW_FEED_JSON_PATH,
  FLOW_FEED_LANGUAGE,
  FLOW_FEED_PATH,
  FLOW_SITE_URL,
  buildJsonFeed,
  buildRssFeed,
  createFeedChannel,
  feedQueryString,
  parseFeedQuery,
  toFeedEntry,
  type FeedQuery,
  type FlowFeedEntry,
} from '@/lib/flow/feed';

const RSS_CONTENT_TYPE = 'application/rss+xml; charset=utf-8';
const JSON_FEED_CONTENT_TYPE = 'application/feed+json; charset=utf-8';

const CACHE_CONTROL = 'public, max-age=600, s-maxage=1800, stale-while-revalidate=86400';

async function loadFeed(request: Request): Promise<{
  query: FeedQuery;
  entries: FlowFeedEntry[];
}> {
  const url = new URL(request.url);
  const query = parseFeedQuery(url.searchParams);
  const result = await getCachedFlowFeedItems(query.limit, query.lang);

  const entries = result.items.map((item) => toFeedEntry(item, markdownToHtml));

  return { query, entries };
}

function normalizeEtag(value: string): string {
  return value.trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
}

function etagMatches(header: string, etag: string): boolean {
  const target = normalizeEtag(etag);

  return header.split(',').some((part) => normalizeEtag(part) === target);
}

function respondWithFeed(
  request: Request,
  body: string,
  contentType: string,
  lastModified: Date
): NextResponse {
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': CACHE_CONTROL,
    'Access-Control-Allow-Origin': '*',
    'X-Content-Type-Options': 'nosniff',
    ETag: `W/"${createHash('sha1').update(body).digest('hex')}"`,
    'Last-Modified': lastModified.toUTCString(),
  };

  const ifNoneMatch = request.headers.get('if-none-match');

  if (ifNoneMatch) {
    // RFC 9110: when If-None-Match is present, If-Modified-Since is ignored.
    if (etagMatches(ifNoneMatch, headers.ETag)) {
      return new NextResponse(null, { status: 304, headers });
    }
  } else {
    const ifModifiedSince = request.headers.get('if-modified-since');

    if (ifModifiedSince) {
      const since = new Date(ifModifiedSince);

      if (!Number.isNaN(since.getTime()) && lastModified.getTime() <= since.getTime()) {
        return new NextResponse(null, { status: 304, headers });
      }
    }
  }

  return new NextResponse(body, { status: 200, headers });
}

function unavailable(): NextResponse {
  return new NextResponse('Flow feed is temporarily unavailable.\n', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      'Retry-After': '300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function handleRssRequest(request: Request): Promise<Response> {
  try {
    const { query, entries } = await loadFeed(request);

    const channel = createFeedChannel({
      entries,
      feedUrl: `${FLOW_SITE_URL}${FLOW_FEED_PATH}${feedQueryString(query)}`,
      language: query.lang ?? FLOW_FEED_LANGUAGE,
    });

    return respondWithFeed(request, buildRssFeed(channel), RSS_CONTENT_TYPE, channel.lastBuildDate);
  } catch (error) {
    console.error('[flow/rss] failed to build RSS feed', error);

    return unavailable();
  }
}

export async function handleJsonFeedRequest(request: Request): Promise<Response> {
  try {
    const { query, entries } = await loadFeed(request);

    const channel = createFeedChannel({
      entries,
      feedUrl: `${FLOW_SITE_URL}${FLOW_FEED_JSON_PATH}${feedQueryString(query)}`,
      language: query.lang ?? FLOW_FEED_LANGUAGE,
    });

    return respondWithFeed(
      request,
      buildJsonFeed(channel),
      JSON_FEED_CONTENT_TYPE,
      channel.lastBuildDate
    );
  } catch (error) {
    console.error('[flow/rss] failed to build JSON feed', error);

    return unavailable();
  }
}
