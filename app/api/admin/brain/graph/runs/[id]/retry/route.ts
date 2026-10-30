import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import {
  computeGraphProgress,
  createBrainGraphStore,
} from '@/lib/knowledge/graph/store';

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainGraphStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { id } = await params;

  try {
    const run = await store.getRun(id);

    if (!run) return json({ error: 'Run not found.' }, 404);

    const reset = await store.resetFailedJobs(id);

    await store.updateRun(id, { status: 'running', completed_at: null });

    const jobs = await store.getJobs(id);

    return json({
      status: 'ok',
      reset,
      run: { ...run, status: 'running' },
      jobs,
      progress: computeGraphProgress(jobs),
    });
  } catch {
    return json({ error: 'Could not retry failed graph jobs.' }, 503);
  }
}
