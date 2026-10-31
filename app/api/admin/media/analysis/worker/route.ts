import { NextResponse } from 'next/server';

import { clearMediaIntelligenceCache } from '@/lib/analytics/mediaIntelligence';
import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { processMediaAnalysisBatch } from '@/lib/knowledge/media/analysisQueue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};

  try {
    const result = await processMediaAnalysisBatch({
      limit: Number(value.limit) || 3,
      maxDurationMs: Number(value.maxDurationMs) || 240_000,
      trigger: 'admin',
    });

    clearMediaIntelligenceCache();

    return json({ status: 'ok', result });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'media_analysis_worker_failed';

    console.error('[Media analysis worker]', { code });

    if (code === 'media_analysis_not_configured') {
      return json({ error: 'DEEPSEEK_API_KEY is not configured.' }, 503);
    }

    if (code === 'media_analysis_database_unavailable') {
      return json({ error: 'Media analysis database is not configured.' }, 503);
    }

    return json({ error: 'Could not process the media analysis queue.' }, 503);
  }
}
