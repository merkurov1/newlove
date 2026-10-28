import { handleRssRequest } from '@/lib/flow/feedRoute';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Alias for readers and services that probe the conventional
 * `*.xml` path. The self link always points at `/flow/rss`.
 */
export async function GET(request: Request): Promise<Response> {
  return handleRssRequest(request);
}
