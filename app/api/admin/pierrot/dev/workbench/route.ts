import { isAuthenticationError } from '@/lib/auth/errors';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getWorkbenchOverview } from '@/lib/pierrot/dev/workbench/overview';
import { dispatchNextQueuedTask } from '@/lib/pierrot/dev/workbench/actions';
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
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth]', error);
      throw error;
    }

    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    // Admin is the guaranteed recovery trigger. Order matters:
    //   1. finalize expired leases and make a retry visible in the queue;
    //   2. dispatch at most one eligible task to GitHub Actions;
    //   3. build the overview from the post-recovery state.
    //
    // Codespaces are deliberately NOT started from this poll. Opening or
    // refreshing Admin must never boot the manual Codespace reserve. The
    // dispatcher respects a paused queue, an active attempt and the per-task
    // dispatch reservation, so it cannot launch duplicates.
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
      await dispatchNextQueuedTask({ source: 'admin:overview' });
    } catch {
      // The overview must still load when the Actions dispatch API is down.
      // The failure is recorded on the task by the dispatcher itself.
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
