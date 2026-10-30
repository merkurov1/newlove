import { parseMediaIntelligenceFilters } from '@/lib/analytics/mediaIntelligenceFilters';
import {
  authorizeMediaIntelligence,
  mediaIntelligenceError,
  mediaIntelligenceJson,
} from '@/lib/analytics/mediaIntelligenceRoute';
import { searchMediaIntelligence } from '@/lib/knowledge/media/search';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await authorizeMediaIntelligence(request);
  if (!auth.ok) return mediaIntelligenceJson({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const query =
    body && typeof body === 'object' && typeof body.query === 'string'
      ? body.query.trim()
      : '';

  if (!query || query.length > 2000) {
    return mediaIntelligenceJson(
      { error: 'Provide a question between 1 and 2000 characters.' },
      400
    );
  }

  const filters = parseMediaIntelligenceFilters(
    body && typeof body === 'object' && body.filters && typeof body.filters === 'object'
      ? (body.filters as Record<string, string | string[] | undefined>)
      : {}
  );

  try {
    const data = await searchMediaIntelligence({ query, filters });
    return mediaIntelligenceJson({ status: 'ok', data });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'media_search_failed';

    if (code === 'media_search_empty_query' || code === 'media_search_query_too_long') {
      return mediaIntelligenceJson({ error: 'Invalid search query.' }, 400);
    }

    if (
      code === 'media_search_database_unavailable' ||
      code === 'media_search_query_failed'
    ) {
      return mediaIntelligenceJson(
        { error: 'Media search is not available. Check database and embeddings configuration.' },
        503
      );
    }

    if (
      code.includes('embedding') ||
      code.includes('OPENROUTER') ||
      code.includes('configuration')
    ) {
      return mediaIntelligenceJson(
        {
          error:
            'Semantic search is unavailable because embedding credentials are not configured.',
        },
        503
      );
    }

    return mediaIntelligenceError(error);
  }
}
