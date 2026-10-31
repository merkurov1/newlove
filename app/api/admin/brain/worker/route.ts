import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { runBrainWorker, runGraphWorker } from '@/lib/knowledge/brain/worker';

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
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const scope = record.scope === 'brain' || record.scope === 'graph' ? record.scope : 'all';
  const maxJobs = Number(record.maxJobs) || undefined;
  const maxDurationMs = scope === 'all' ? 120_000 : 240_000;

  try {
    const results: unknown[] = [];

    if (scope === 'brain' || scope === 'all') {
      results.push(
        await runBrainWorker({ trigger: 'admin', maxJobs, maxDurationMs })
      );
    }

    if (scope === 'graph' || scope === 'all') {
      results.push(
        await runGraphWorker({ trigger: 'admin', maxJobs, maxDurationMs })
      );
    }

    return json({ status: 'ok', results });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'worker_failed';

    console.error('[Brain admin worker]', { code, scope });

    if (
      code === 'embedding_not_configured' ||
      code === 'graph_llm_not_configured' ||
      code === 'brain_database_unavailable' ||
      code === 'brain_graph_database_unavailable'
    ) {
      return json({ error: code }, 503);
    }

    return json({ error: code }, 500);
  }
}
