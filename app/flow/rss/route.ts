import { handleRssRequest } from '@/lib/flow/feedRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Canonical Flow feed.
 *
 *   /flow/rss            all languages
 *   /flow/rss?lang=ru    Russian posts only
 *   /flow/rss?lang=en    English posts only
 *   /flow/rss?limit=100  up to MAX_FEED_LIMIT items
 */
export async function GET(request: Request): Promise<Response> {
  return handleRssRequest(request);
}
