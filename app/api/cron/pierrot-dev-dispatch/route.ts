import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/knowledge/brain/cronAuth';
import { dispatchNextQueuedTask } from '@/lib/pierrot/dev/workbench/actions';
import { advanceFinalization } from '@/lib/pierrot/dev/workbench/finalization';
import { reapExpiredAttempts } from '@/lib/pierrot/dev/workbench/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : 'unknown_error';
}

/**
 * Autonomous queue recovery.
 *
 * This reuses the already-approved scheduler tick (Supabase pg_cron posts to
 * the protected /api/cron endpoints every five minutes). It does not add a new
 * cron schedule and it is not an always-on worker: each invocation is bounded,
 * claims no task itself, and delegates to the same idempotent lifecycle
 * functions used by Admin.
 *
 * Stages are isolated so one provider outage cannot hide the other outcomes:
 *   1. release expired leases;
 *   2. dispatch at most one eligible queued task (CAS + reservation);
 *   3. advance the locked finalization pump by one bounded step.
 *
 * Finalization is idempotent, guarded by a database lock and skips unless the
 * queue is genuinely drained. Reusing this scheduler is what makes queue
 * progression, lease recovery and finalization independent of an open Admin
 * tab without adding always-on infrastructure or recurring cost. No stage
 * starts a Codespace.
 */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) return json({ error: 'Unauthorized' }, 401);

  const startedAt = new Date().toISOString();
  const errors: Array<{ stage: string; code: string }> = [];

  let reaped = 0;
  try {
    reaped = await reapExpiredAttempts();
  } catch (error) {
    const code = errorCode(error);
    errors.push({ stage: 'reap', code });
    console.error('[Pierrot Dev dispatch cron] lease recovery failed', { code });
  }

  let dispatch: Awaited<ReturnType<typeof dispatchNextQueuedTask>> | null = null;
  try {
    dispatch = await dispatchNextQueuedTask({ source: 'cron:pierrot-dev-dispatch' });
  } catch (error) {
    const code = errorCode(error);
    errors.push({ stage: 'dispatch', code });
    console.error('[Pierrot Dev dispatch cron] dispatch failed', { code });
  }

  let finalization: Awaited<ReturnType<typeof advanceFinalization>> | null = null;
  try {
    finalization = await advanceFinalization({ trigger: 'cron:pierrot-dev-dispatch' });
  } catch (error) {
    const code = errorCode(error);
    errors.push({ stage: 'finalization', code });
    console.error('[Pierrot Dev dispatch cron] finalization failed', { code });
  }

  const status = errors.length === 0 ? 'ok' : 'degraded';
  const body = {
    status,
    reaped,
    dispatch: dispatch || {
      dispatched: false,
      taskId: null,
      repository: null,
      code: 'DISPATCH_RECOVERY_FAILED',
      reason: 'The dispatcher did not complete.',
      requestedAt: null,
    },
    finalization: finalization
      ? {
          stage: finalization.stage,
          pullRequests: finalization.pullRequests,
          integrated: finalization.integrated,
          retryAt: finalization.retryAt ?? null,
          blockedReason: finalization.blockedReason,
        }
      : null,
    errors,
    ranAt: startedAt,
    completedAt: new Date().toISOString(),
  };

  return json(body, status === 'ok' ? 200 : 503);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
