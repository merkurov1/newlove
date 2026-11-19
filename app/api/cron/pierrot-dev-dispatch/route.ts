import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/knowledge/brain/cronAuth';
import { dispatchNextQueuedTask } from '@/lib/pierrot/dev/workbench/actions';
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

/**
 * Autonomous dispatch recovery.
 *
 * This reuses the already-approved scheduler tick (Supabase pg_cron posts to
 * the protected /api/cron endpoints every five minutes). It does not add a new
 * cron schedule and it is not an always-on worker: each invocation is bounded,
 * claims no task itself, and delegates to the same idempotent dispatcher used
 * by Admin. A stale dispatch marker is therefore recovered even when nobody
 * has the Dev Workbench open.
 */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) return json({ error: 'Unauthorized' }, 401);

  try {
    // Free an expired lease first so its task can be considered safely.
    const reaped = await reapExpiredAttempts();
    const result = await dispatchNextQueuedTask({ source: 'cron:pierrot-dev-dispatch' });
    return json({
      status: 'ok',
      reaped,
      dispatch: result,
      ranAt: new Date().toISOString(),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'dispatch_recovery_failed';
    console.error('[Pierrot Dev dispatch cron]', { code });
    return json({ error: 'Dispatch recovery failed.', code }, 503);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
