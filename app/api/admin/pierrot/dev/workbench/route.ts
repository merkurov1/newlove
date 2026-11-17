import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getWorkbenchOverview } from '@/lib/pierrot/dev/workbench/overview';
import { ensureCodespaceForQueuedWork } from '@/lib/pierrot/dev/workbench/lifecycle';
import { advanceFinalization } from '@/lib/pierrot/dev/workbench/finalization';
import { reapExpiredAttempts } from '@/lib/pierrot/dev/workbench/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
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

export async function GET(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    // Admin is the guaranteed recovery trigger. Order matters:
    //   1. finalize expired leases and make a retry visible in the queue;
    //   2. run the guarded lifecycle reconcile against that fresh queue;
    //   3. build the overview from the post-recovery state.
    // ensureCodespaceForQueuedWork still enforces every safety rule: an active
    // attempt, paused queue, startup grace, cooldown and circuit breaker. It
    // never stops a live Codespace merely because a heartbeat is stale, and it
    // never starts a second worker over an existing attempt.
    //
    // There is no cron or always-on supervisor: this request-driven Admin poll
    // is the recovery trigger. While nobody polls Admin, an expired lease stays
    // visible but is not finalized until the next authorized overview request.
    try {
      await reapExpiredAttempts();
    } catch {
      // A missing migration or transient RPC error must not hide the overview.
    }

    try {
      await ensureCodespaceForQueuedWork({
        source: 'admin:overview',
        allowWorkerRecovery: true,
      });
    } catch {
      // The overview must still load when Codespaces is temporarily unavailable.
    }

    // Admin is also a finalization pump: when the queue is drained, each poll
    // advances one bounded integration step. The finalizer is idempotent and
    // locked, so a concurrent idle poll cannot merge twice.
    try {
      await advanceFinalization({ trigger: 'admin:overview' });
    } catch {
      // Finalization must not hide the overview when GitHub is unavailable.
    }

    const overview = await getWorkbenchOverview(admin.id, { skipReap: true });
    return json({ overview });
  } catch (error) {
    console.error('[Pierrot Dev Workbench] overview failed', {
      code: error instanceof Error ? error.name : 'unknown',
    });
    return json({ error: 'Unable to load the workbench overview.' }, 500);
  }
}
