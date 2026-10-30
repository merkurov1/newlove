import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createBrainStore } from '@/lib/knowledge/brain/store';

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

    if (run.status === 'completed' || run.status === 'cancelled') {
      return json({ error: 'This run cannot be cancelled.' }, 409);
    }

    await store.cancelRun(runId);

    const updated = (await store.getRun(runId)) ?? run;
    const jobs = await store.getJobs(runId);

    return json({ status: 'cancelled', run: updated, jobs });
  } catch {
    return json({ error: 'Could not cancel the run.' }, 503);
  }
}
