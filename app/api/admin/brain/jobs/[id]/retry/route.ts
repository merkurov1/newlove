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

/**
 * Explicit, non-destructive retry for one failed/partial/duplicate job.
 * The document and its chunks are never deleted here; the normal worker
 * re-fetches and either updates the existing logical document or marks the
 * content duplicate.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { id } = await params;

  try {
    const job = await store.getJob(id);

    if (!job) return json({ error: 'Job not found.' }, 404);

    if (!['failed', 'partial', 'duplicate'].includes(job.status)) {
      return json({ error: 'Only failed, partial or duplicate jobs can be retried.' }, 409);
    }

    const reset = await store.resetJob(id);

    if (!reset) return json({ error: 'The job could not be requeued.' }, 409);

    await store.updateRun(reset.run_id, { status: 'running', completed_at: null });

    const jobs = await store.getJobs(reset.run_id);

    return json({
      status: 'ok',
      job: reset,
      runId: reset.run_id,
      jobs,
      progress: computeBrainProgress(jobs),
    });
  } catch {
    return json({ error: 'Could not retry the job.' }, 503);
  }
}
