import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Public RSS entry point.
 *
 * The Journal feed is the site-wide editorial feed, and its canonical route is
 * `/feed.xml`. Keep `/rss.xml` as a permanent alias so readers and services
 * that probe the conventional `.xml` path reach exactly one feed.
 *
 * Do not point this alias at `/flow/rss`: Flow has its own canonical feed at
 * `/flow/rss` and the two documents must not be confused.
 */
export function GET(request: Request): Response {
  return NextResponse.redirect(new URL('/feed.xml', request.url), 308);
}
