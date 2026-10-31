import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { computeBrainProgress } from '@/lib/knowledge/brain/process';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { assertQueueCapacity } from '@/lib/operations/budgets';

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

export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { runId } = await params;

  try {
    const run = await store.getRun(runId);

    if (!run) return json({ error: 'Run not found.' }, 404);

    await assertQueueCapacity('brain');

    const reset = await store.resetFailedJobs(runId);
    await store.updateRun(runId, { status: 'running', completed_at: null });

    const jobs = await store.getJobs(runId);

    return json({
      status: 'ok',
      reset,
      run: { ...run, status: 'running' },
      jobs,
      progress: computeBrainProgress(jobs),
    });
  } catch {
    return json({ error: 'Could not retry failed jobs.' }, 503);
  }
}
