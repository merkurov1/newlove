import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { parseMediaIntelligenceFilters } from '@/lib/analytics/mediaIntelligenceFilters';

export const mediaIntelligenceHeaders = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'X-Robots-Tag': 'noindex, nofollow',
};

export function mediaIntelligenceJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: mediaIntelligenceHeaders,
  });
}

export async function authorizeMediaIntelligence(request: Request) {
  return authorizeKnowledgeAdmin(request);
}

export function filtersFromRequest(request: Request) {
  const url = new URL(request.url);
  return parseMediaIntelligenceFilters(Object.fromEntries(url.searchParams.entries()));
}

export function mediaIntelligenceError(error: unknown) {
  const code = error instanceof Error ? error.message : 'media_intelligence_failed';

  console.error('[Media Intelligence API]', { code });

  if (code === 'media_intelligence_database_unavailable') {
    return mediaIntelligenceJson({ error: 'Media intelligence database is not configured.' }, 503);
  }

  return mediaIntelligenceJson({ error: 'Could not load media intelligence data.' }, 503);
}
