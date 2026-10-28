import { handleJsonFeedRequest } from '@/lib/flow/feedRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * JSON Feed 1.1 mirror of `/flow/rss` for modern readers and services
 * that prefer JSON over XML.
 */
export async function GET(request: Request): Promise<Response> {
  return handleJsonFeedRequest(request);
}
