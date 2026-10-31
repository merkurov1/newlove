import { handleRssRequest } from '@/lib/flow/feedRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Alias for readers and services that probe the conventional `*.xml` path.
 *
 * The canonical Flow feed is `/flow/rss` and the document's self link always
 * points there. This alias stays available so existing subscribers do not lose
 * the feed; it is not a second canonical URL.
 */
export async function GET(request: Request): Promise<Response> {
  return handleRssRequest(request);
}
