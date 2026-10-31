import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { computeBrainProgress } from '@/lib/knowledge/brain/process';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { runBrainWorker, runGraphWorker } from '@/lib/knowledge/brain/worker';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';
import {
  enqueueMediaAnalyses,
  processMediaAnalysisBatch,
} from '@/lib/knowledge/media/analysisQueue';
import {
  loadWorkerControl,
  setWorkerScopeEnabled,
  setWorkersEnabled,
} from '@/lib/operations/control';
import { WORKER_SCOPES, workerLimits, type WorkerScope } from '@/lib/operations/config';
import { loadOperationsSnapshot } from '@/lib/operations/dashboard';
import { recordOpsEvent } from '@/lib/operations/events';

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

function isScope(value: unknown): value is WorkerScope {
  return typeof value === 'string' && (WORKER_SCOPES as string[]).includes(value);
}

export async function GET(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  try {
    const snapshot = await loadOperationsSnapshot();
    return json({ status: 'ok', snapshot });
  } catch {
    return json({ error: 'Could not load operations status.' }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const body = await request.json().catch(() => ({}));
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const action = typeof value.action === 'string' ? value.action : '';

  try {
    if (action === 'set_kill_switch') {
      const enabled = value.enabled === true;
      await setWorkersEnabled(enabled, auth.actor);
      await recordOpsEvent({
        event: enabled ? 'global_kill_switch_enabled' : 'worker_completed',
        scope: 'global',
        workerId: auth.actor,
        severity: enabled ? 'warning' : 'info',
        details: { workers_enabled: enabled },
      });
      return json({ status: 'ok', control: await loadWorkerControl() });
    }

    if (action === 'set_worker') {
      if (!isScope(value.scope)) return json({ error: 'Unknown worker scope.' }, 400);

      const enabled = value.enabled === true;
      await setWorkerScopeEnabled(value.scope, enabled, auth.actor);
      await recordOpsEvent({
        event: enabled ? 'worker_completed' : 'worker_skipped',
        scope: value.scope,
        workerId: auth.actor,
        severity: enabled ? 'info' : 'warning',
        details: { enabled },
      });
      return json({ status: 'ok', control: await loadWorkerControl() });
    }

    if (action === 'run_batch') {
      if (!isScope(value.scope)) return json({ error: 'Unknown worker scope.' }, 400);
      if (value.confirm !== true) {
        return json(
          {
            error: 'Batch confirmation required.',
            queued: (await loadOperationsSnapshot()).queues[value.scope].queued,
            detail: 'Send confirm=true after reviewing the queue volume.',
          },
          409
        );
      }

      const limits = workerLimits(value.scope);
      const maxJobs = Math.min(
        Math.max(Number(value.maxJobs) || limits.maxJobs, 1),
        limits.maxJobs
      );

      if (value.scope === 'brain') {
        const result = await runBrainWorker({
          trigger: 'admin',
          maxJobs,
          maxDurationMs: limits.maxDurationMs,
        });
        return json({ status: 'ok', scope: 'brain', result });
      }

      if (value.scope === 'graph') {
        const result = await runGraphWorker({
          trigger: 'admin',
          maxJobs,
          maxDurationMs: limits.maxDurationMs,
        });
        return json({ status: 'ok', scope: 'graph', result });
      }

      if (value.scope === 'media') {
        const result = await processMediaAnalysisBatch({
          limit: maxJobs,
          maxDurationMs: limits.maxDurationMs,
          trigger: 'admin',
        });
        return json({ status: 'ok', scope: 'media', result });
      }

      return json({ error: 'This worker has no manual batch runner.' }, 400);
    }

    if (action === 'retry_job' || action === 'recover_dead_letter') {
      if (!isScope(value.scope)) return json({ error: 'Unknown worker scope.' }, 400);
      const jobId = typeof value.jobId === 'string' ? value.jobId : '';

      if (value.scope === 'brain') {
        const store = createBrainStore();
        if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);
        if (!jobId) return json({ error: 'jobId is required.' }, 400);

        const job = await store.getJob(jobId);
        if (!job) return json({ error: 'Job not found.' }, 404);
        if (!['failed', 'partial', 'duplicate'].includes(job.status)) {
          return json({ error: 'Only failed, partial or duplicate jobs can be retried.' }, 409);
        }

        const reset = await store.resetJob(jobId);
        if (!reset) return json({ error: 'The job could not be requeued.' }, 409);
        await store.updateRun(reset.run_id, { status: 'running', completed_at: null });
        await recordOpsEvent({
          event: 'job_retry',
          scope: 'brain',
          workerId: auth.actor,
          details: { job_id: jobId },
        });
        const jobs = await store.getJobs(reset.run_id);

        return json({
          status: 'ok',
          scope: 'brain',
          job: reset,
          runId: reset.run_id,
          progress: computeBrainProgress(jobs),
        });
      }

      if (value.scope === 'graph') {
        const store = createBrainGraphStore();
        if (!store) return json({ error: 'Graph database is not configured.' }, 503);
        if (!jobId) return json({ error: 'jobId is required.' }, 400);

        const job = await store.getJob(jobId);
        if (!job) return json({ error: 'Job not found.' }, 404);
        if (!['failed', 'skipped', 'cancelled'].includes(job.status)) {
          return json({ error: 'Only failed, skipped or cancelled jobs can be retried.' }, 409);
        }

        const reset = await store.resetJob(jobId);
        if (!reset) return json({ error: 'The job could not be requeued.' }, 409);
        await store.updateRun(reset.run_id, { status: 'running', completed_at: null });
        await recordOpsEvent({
          event: 'job_retry',
          scope: 'graph',
          workerId: auth.actor,
          details: { job_id: jobId },
        });

        return json({ status: 'ok', scope: 'graph', job: reset, runId: reset.run_id });
      }

      if (value.scope === 'media') {
        const mediaRecordId = typeof value.mediaRecordId === 'string' ? value.mediaRecordId : '';
        if (!mediaRecordId) return json({ error: 'mediaRecordId is required.' }, 400);

        const result = await enqueueMediaAnalyses({
          mode: 'selected',
          recordIds: [mediaRecordId],
          force: true,
          limit: 1,
          requestedBy: auth.actor,
        });
        await recordOpsEvent({
          event: 'job_retry',
          scope: 'media',
          workerId: auth.actor,
          details: { media_record_id: mediaRecordId },
        });

        return json({ status: 'ok', scope: 'media', result });
      }

      return json({ error: 'This worker has no single-job retry path.' }, 400);
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'operations_action_failed';
    console.error('[Operations] action failed', { action, code });
    return json({ error: code }, 503);
  }
}
