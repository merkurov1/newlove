import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { enqueueBrainSources } from '@/lib/knowledge/brain/enqueue';
import { processBrainRunInline } from '@/lib/knowledge/brain/inline';
import { computeBrainProgress } from '@/lib/knowledge/brain/process';
import {
  BRAIN_SOURCE_LIMITS,
  isBrainSourceKind,
  type BrainSourceDescriptor,
} from '@/lib/knowledge/brain/sourceTypes';
import {
  BrainSourceError,
  brainSourceErrorMessage,
} from '@/lib/knowledge/brain/sourceValidation';
import { createBrainStore } from '@/lib/knowledge/brain/store';

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

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Invalid request.' }, 400);
  }

  const record = body as Record<string, unknown>;
  const rawSources = Array.isArray(record.sources) ? record.sources : [];

  if (rawSources.length === 0) {
    return json({ error: 'Provide at least one source.' }, 400);
  }

  if (rawSources.length > BRAIN_SOURCE_LIMITS.maxUrls) {
    return json({ error: `At most ${BRAIN_SOURCE_LIMITS.maxUrls} sources per batch.` }, 400);
  }

  const sources = rawSources
    .filter(
      (source): source is Record<string, unknown> =>
        Boolean(source) && typeof source === 'object' && !Array.isArray(source)
    )
    .filter((source) => isBrainSourceKind(source.kind)) as BrainSourceDescriptor[];

  if (sources.length === 0) {
    return json({ error: 'No valid sources were provided.' }, 400);
  }

  try {
    const store = createBrainStore();

    if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

    const result = await enqueueBrainSources({
      sources,
      requestedBy: auth.actor,
      recheckExisting: record.recheckExisting === true,
    });

    // A normal save must become searchable without an operator opening an
    // admin worker. Process one freshly-created job synchronously under a hard
    // time/job budget. Remaining batch jobs stay queued and can be drained by
    // the existing per-run endpoint; no scheduler is created here.
    const inline = result.startRun
      ? await processBrainRunInline({
          store,
          runId: result.startRun.id,
          maxJobs: 1,
          budgetMs: 90_000,
        })
      : null;

    const jobs = result.startRun ? await store.getJobs(result.startRun.id) : result.jobs;
    const progress = computeBrainProgress(jobs);

    return json(
      {
        status: result.startRun ? 'ok' : 'noop',
        run: result.startRun,
        jobs,
        progress,
        rows: result.rows,
        skipped: result.skipped,
        inline,
        nextUrl:
          result.startRun && progress.queued + progress.processing > 0
            ? `/api/admin/brain/runs/${result.startRun.id}/next`
            : null,
      },
      202
    );
  } catch (error) {
    if (error instanceof BrainSourceError) {
      return json(
        { error: error.code, message: brainSourceErrorMessage(error.code) },
        error.status
      );
    }

    console.error('[Brain sources]', {
      code: error instanceof Error ? error.message : 'enqueue_failed',
    });

    return json({ error: 'Could not enqueue the sources.' }, 503);
  }
}
