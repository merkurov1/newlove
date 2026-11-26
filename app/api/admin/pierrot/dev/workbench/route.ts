import { isAuthenticationError } from '@/lib/auth/errors';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getWorkbenchOverview } from '@/lib/pierrot/dev/workbench/overview';
import { WorkbenchStageTimer } from '@/lib/pierrot/dev/workbench/telemetry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
      ...headers,
    },
  });
}

/**
 * Read-only Admin snapshot.
 *
 * This endpoint used to run reap -> dispatch -> finalization -> overview in one
 * request. A slow GitHub dispatch or finalization therefore competed with the
 * overview and could time out a page poll that only needed to display state.
 *
 * Recovery now belongs to the existing lifecycles:
 *   * the protected `/api/cron/pierrot-dev-dispatch` tick runs one bounded
 *     reap + dispatch pass;
 *   * the worker lifecycle finalizes while shutting down and after completions;
 *   * the explicit `recover` Admin action runs the same bounded recovery pass.
 *
 * The GET must never mutate: repeated polls and concurrent tabs are safe and
 * cannot create duplicate dispatch, finalization or reap side effects. Stage
 * durations are emitted to structured telemetry and returned in `telemetry`
 * and the `Server-Timing` header so the slowest stage stays visible.
 */
export async function GET(req: Request) {
  const timer = new WorkbenchStageTimer({
    label: 'GET /api/admin/pierrot/dev/workbench',
    source: 'admin:overview',
  });

  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await timer.measure('auth', () => requireAdminFromRequest(req));
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth]', error);
      timer.log();
      throw error;
    }

    timer.log();
    return json({ error: 'Unauthorized', telemetry: timer.summary() }, 401, {
      'Server-Timing': timer.serverTiming(),
    });
  }

  try {
    const overview = await timer.measure('overview', () =>
      getWorkbenchOverview(admin.id, { skipReap: true, telemetry: timer })
    );
    timer.log();
    return json({ overview, telemetry: timer.summary() }, 200, {
      'Server-Timing': timer.serverTiming(),
    });
  } catch (error) {
    console.error('[Pierrot Dev Workbench] overview failed', {
      code: error instanceof Error ? error.name : 'unknown',
    });
    timer.log();
    return json(
      {
        error: 'Unable to load the workbench overview.',
        telemetry: timer.summary(),
      },
      500,
      { 'Server-Timing': timer.serverTiming() }
    );
  }
}
