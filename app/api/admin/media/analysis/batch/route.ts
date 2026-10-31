import { NextResponse } from 'next/server';

import { clearMediaIntelligenceCache } from '@/lib/analytics/mediaIntelligence';
import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import {
  enqueueMediaAnalyses,
  processMediaAnalysisBatch,
  type MediaAnalysisEnqueueMode,
} from '@/lib/knowledge/media/analysisQueue';

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

const MODES = new Set<MediaAnalysisEnqueueMode>(['all', 'selected', 'retry_failed']);

function recordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => /^[0-9a-f-]{36}$/i.test(item))
    )
  ).slice(0, 500);
}

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const mode =
    typeof value.mode === 'string' && MODES.has(value.mode as MediaAnalysisEnqueueMode)
      ? (value.mode as MediaAnalysisEnqueueMode)
      : 'selected';
  const ids = recordIds(value.recordIds);

  if (mode === 'selected' && ids.length === 0) {
    return json({ error: 'Select at least one publication.' }, 400);
  }

  const limit = Number(value.limit) || (mode === 'all' ? 50 : ids.length);
  const force = value.force === true;

  try {
    const enqueued = await enqueueMediaAnalyses({
      mode,
      recordIds: ids,
      force,
      limit,
      requestedBy: auth.actor || null,
    });

    let processed: Awaited<ReturnType<typeof processMediaAnalysisBatch>> | null = null;

    if (value.run === true && enqueued.queued > 0) {
      processed = await processMediaAnalysisBatch({
        limit: Math.min(Number(value.maxJobs) || 3, 10),
        maxDurationMs: 180_000,
        trigger: 'admin',
      });
    }

    clearMediaIntelligenceCache();

    return json({ status: 'ok', enqueued, processed });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'media_analysis_batch_failed';

    console.error('[Media analysis batch]', { code, mode });

    if (code.startsWith('queue_limit') || code.startsWith('enqueue_limit')) {
      return json({ error: code }, 429);
    }

    if (code === 'media_analysis_not_configured') {
      return json({ error: 'DEEPSEEK_API_KEY is not configured; analysis cannot run.' }, 503);
    }

    if (code === 'media_analysis_database_unavailable') {
      return json({ error: 'Media analysis database is not configured.' }, 503);
    }

    return json({ error: 'Could not enqueue media analysis.' }, 503);
  }
}
