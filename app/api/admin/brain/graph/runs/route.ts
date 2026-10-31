import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { getGraphModel, isGraphLlmConfigured } from '@/lib/knowledge/graph/deepseek';
import { createGraphRun } from '@/lib/knowledge/graph/pipeline';
import { computeGraphProgress, createBrainGraphStore } from '@/lib/knowledge/graph/store';
import { assertEnqueueLimit, assertQueueCapacity } from '@/lib/operations/budgets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function GET(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainGraphStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  try {
    const runs = await store.listRecentRuns(10);
    const runSummaries = [];

    for (const run of runs) {
      const jobs = await store.getJobs(run.id);
      runSummaries.push({ run, progress: computeGraphProgress(jobs) });
    }

    return json({ status: 'ok', runs: runSummaries });
  } catch {
    return json({ error: 'Could not read graph runs.' }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  if (!isGraphLlmConfigured()) {
    return json({ error: 'DEEPSEEK_API_KEY is not configured.' }, 503);
  }

  const store = createBrainGraphStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const body = await request.json().catch(() => ({}));
  const documentIds = Array.isArray(body.documentIds)
    ? body.documentIds.filter((value: unknown): value is string => typeof value === 'string')
    : null;

  try {
    const documents = await store.listDocuments(2000);
    const selected = documentIds
      ? documents.filter((document) => documentIds.includes(document.id))
      : documents;

    assertEnqueueLimit(selected.length);
    await assertQueueCapacity('graph');

    const result = await createGraphRun({
      store,
      documents: selected,
      model: getGraphModel(),
      metadata: { source: 'admin_graph_build' },
    });

    if (!result.run) {
      return json({
        status: 'noop',
        run: null,
        jobs: [],
        skippedDocumentIds: result.skippedDocumentIds,
        progress: {
          total: 0,
          queued: 0,
          processing: 0,
          completed: 0,
          skipped: 0,
          failed: 0,
          cancelled: 0,
          done: true,
        },
        message: 'The graph is already up to date for this extractor version.',
      });
    }

    return json({
      status: 'ok',
      run: result.run,
      jobs: result.jobs,
      skippedDocumentIds: result.skippedDocumentIds,
      progress: computeGraphProgress(result.jobs),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'graph_run_failed';
    console.error('[Brain graph run]', { code });

    if (code.startsWith('enqueue_limit') || code.startsWith('queue_limit')) {
      return json({ error: code }, 429);
    }

    return json({ error: 'Could not create the graph extraction run.' }, 503);
  }
}
