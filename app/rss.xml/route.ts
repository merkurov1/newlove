import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Legacy feed URL. It used to emit a hand-built document with links to
 * non-existent `/{lang}/{slug}` pages. Readers that subscribed to it are
 * permanently redirected to the maintained Flow feed instead of keeping a
 * second, divergent copy of the same content.
 */
export function GET(request: Request): Response {
  return NextResponse.redirect(new URL('/flow/rss', request.url), 308);
}
