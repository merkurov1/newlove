import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getWorkbenchOverview } from '@/lib/pierrot/dev/workbench/overview';
import { ensureCodespaceForQueuedWork } from '@/lib/pierrot/dev/workbench/lifecycle';

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
    // Safe reconcile only: this may start a genuinely stopped Codespace when
    // queued work exists, but it must never stop or restart an Available one.
    // Worker recovery is an explicit owner action, not part of the page GET.
    // No retry loop runs inside this request; pending state is persisted and
    // completed by the next idempotent overview poll.
    try {
      await ensureCodespaceForQueuedWork({
        source: 'admin:overview',
        allowWorkerRecovery: false,
      });
    } catch {
      // The overview must still load when Codespaces is temporarily unavailable.
    }

    const overview = await getWorkbenchOverview(admin.id);
    return json({ overview });
  } catch (error) {
    console.error('[Pierrot Dev Workbench] overview failed', {
      code: error instanceof Error ? error.name : 'unknown',
    });
    return json({ error: 'Unable to load the workbench overview.' }, 500);
  }
}
