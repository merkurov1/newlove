import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { computeBrainProgress } from '@/lib/knowledge/brain/process';
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { id } = await params;

  try {
    const run = await store.getRun(id);

    if (!run) return json({ error: 'Run not found.' }, 404);

    if (run.status === 'running') {
      await store.updateRun(id, { status: 'paused' });
    } else if (run.status !== 'paused') {
      return json({ error: 'This run cannot be paused.' }, 409);
    }

    const updated = (await store.getRun(id)) ?? run;
    const jobs = await store.getJobs(id);

    return json({ status: 'ok', run: updated, jobs, progress: computeBrainProgress(jobs) });
  } catch {
    return json({ error: 'Could not pause the run.' }, 503);
  }
}
