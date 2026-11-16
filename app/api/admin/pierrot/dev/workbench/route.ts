import { NextResponse, after } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getWorkbenchOverview } from '@/lib/pierrot/dev/workbench/overview';
import {
  ensureCodespaceForQueuedWork,
  retryPendingStart,
} from '@/lib/pierrot/dev/workbench/lifecycle';

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

export async function GET(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    // The Admin page is also a bounded recovery trigger: if a queued task is
    // stranded because a start failed or a stop raced with submission, this
    // reconcile pass starts the Codespace without any owner action.
    try {
      const result = await ensureCodespaceForQueuedWork({
        source: 'admin:overview',
        waitForStopMs: 0,
      });
      if (result.action === 'start-pending') {
        after(async () => {
          try {
            await retryPendingStart('admin:overview');
          } catch {
            // The next overview poll retries again.
          }
        });
      }
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
