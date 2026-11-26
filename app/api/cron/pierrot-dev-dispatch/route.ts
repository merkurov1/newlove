import { NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/knowledge/brain/cronAuth';
import { runWorkbenchRecovery } from '@/lib/pierrot/dev/workbench/recovery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
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
 * Autonomous dispatch recovery.
 *
 * This reuses the already-approved scheduler tick (Supabase pg_cron posts to
 * the protected /api/cron endpoints every five minutes). It does not add a new
 * cron schedule and it is not an always-on worker: each invocation is bounded
 * to one reap pass and one dispatch pass, claims no task itself, and delegates
 * to the same idempotent primitives used by Admin. A stale dispatch marker is
 * therefore recovered even when nobody has the Dev Workbench open.
 *
 * Stage durations are recorded in structured telemetry and returned in
 * `recovery.telemetry`, so a slow reap or dispatch is attributable.
 */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) return json({ error: 'Unauthorized' }, 401);

  try {
    const recovery = await runWorkbenchRecovery({
      source: 'cron:pierrot-dev-dispatch',
      steps: ['reap', 'dispatch'],
      budgetMs: 20_000,
    });
    // A partial pass is still a successful tick: the unfinished step retries on
    // the next schedule and tasks remain queued. Only a fully failed pass is
    // reported as an error to the scheduler.
    const status = recovery.status === 'failed' ? 503 : 200;
    return json(
      {
        status: recovery.status,
        reaped: recovery.reaped,
        dispatch: recovery.dispatch,
        recovery,
        ranAt: new Date().toISOString(),
      },
      status,
      {
        'Server-Timing': recovery.telemetry.stages
          .map((s) => `${s.stage};dur=${s.durationMs}`)
          .join(', '),
      }
    );
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
