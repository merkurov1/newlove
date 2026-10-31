import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { computeBrainProgress, type BrainProgress } from '@/lib/knowledge/brain/process';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { enqueueMediaCoverageJob } from '@/lib/knowledge/media/queue';
import { parseMediaBulkBody, planMediaBulkInputs } from '@/lib/knowledge/media/bulk';
import { assertEnqueueLimit, assertQueueCapacity } from '@/lib/operations/budgets';
import { maxEnqueuePerRequest } from '@/lib/operations/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_URLS = maxEnqueuePerRequest();

type BulkRow = {
  input: string;
  normalizedUrl: string | null;
  status:
    'queued' | 'existing_queued' | 'already_queued' | 'invalid' | 'duplicate_in_input' | 'error';
  reason?: string;
  mediaRecordId?: string;
  title?: string;
  jobId?: string;
  runId?: string;
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./i, '').slice(0, 300);
  } catch {
    return 'Unknown publication';
  }
}

export async function GET(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  try {
    const runs = (await store.listRecentRuns(30)).filter((run) => {
      const source = run.metadata?.source;
      return typeof source === 'string' && source.includes('media');
    });
    const jobs = await store.getJobsForRuns(runs.map((run) => run.id));
    const byRun = new Map<string, typeof jobs>();

    for (const job of jobs) {
      const list = byRun.get(job.run_id) || [];
      list.push(job);
      byRun.set(job.run_id, list);
    }

    return json({
      status: 'ok',
      runs: runs.map((run) => ({
        run,
        progress: computeBrainProgress(byRun.get(run.id) || []),
      })),
    });
  } catch {
    return json({ error: 'Could not read media import history.' }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const body = await request.json().catch(() => ({}));
  const inputs = parseMediaBulkBody(body, MAX_URLS);

  if (inputs.length === 0) {
    return json({ error: 'Provide at least one URL.' }, 400);
  }

  try {
    assertEnqueueLimit(inputs.length);
    await assertQueueCapacity('brain');
  } catch (error) {
    const code = error instanceof Error ? error.message : 'queue_limit_reached';
    return json({ error: code }, code.startsWith('queue_limit') ? 429 : 503);
  }

  const rows: BulkRow[] = [];
  const plan = planMediaBulkInputs(inputs);
  let runId: string | null = null;

  for (const planned of plan) {
    if (planned.status !== 'candidate') {
      rows.push({
        input: planned.input,
        normalizedUrl: planned.normalizedUrl,
        status: planned.status,
        ...(planned.status === 'invalid' ? { reason: planned.reason } : {}),
      });
      continue;
    }

    const input = planned.input;
    const normalizedUrl = planned.normalizedUrl;

    try {
      const existing = await store.findMediaRecordByUrl(input, normalizedUrl);
      let mediaRecordId: string;
      let title: string;

      if (existing) {
        mediaRecordId = existing.id;
        title = existing.title;
      } else {
        const host = hostOf(normalizedUrl);
        const created = await store.createMediaDraftRecord({
          url: input,
          normalizedUrl,
          title: `Pending import: ${host}`,
          outlet: host,
          source: 'media_bulk_import',
        });
        mediaRecordId = created.record.id;
        title = created.record.title;
      }

      const queued = await enqueueMediaCoverageJob({
        store,
        mediaRecordId,
        inputUrl: input,
        normalizedUrl,
        requestedBy: auth.actor,
        runId,
        source: 'media_bulk_import',
      });

      if (queued.status === 'queued') runId = queued.runId;

      rows.push({
        input,
        normalizedUrl,
        status:
          queued.status === 'already_queued'
            ? 'already_queued'
            : existing
              ? 'existing_queued'
              : 'queued',
        mediaRecordId,
        title,
        jobId: queued.job.id,
        runId: queued.runId,
      });
    } catch (error) {
      console.error('[Media bulk import] row failed', {
        code: error instanceof Error ? error.message : 'media_bulk_row_failed',
      });
      rows.push({
        input,
        normalizedUrl,
        status: 'error',
        reason: 'Не удалось поставить публикацию в очередь.',
      });
    }
  }

  let progress: BrainProgress | null = null;

  if (runId) {
    try {
      const jobs = await store.getJobs(runId);
      progress = computeBrainProgress(jobs);
    } catch {
      progress = null;
    }
  }

  const queuedCount = rows.filter(
    (row) =>
      row.status === 'queued' || row.status === 'existing_queued' || row.status === 'already_queued'
  ).length;

  return json(
    {
      status: queuedCount > 0 ? 'ok' : 'noop',
      runId,
      rows,
      progress,
      limits: { maxUrls: MAX_URLS },
      nextUrl: runId ? `/api/admin/brain/runs/${runId}/next` : null,
    },
    202
  );
}
