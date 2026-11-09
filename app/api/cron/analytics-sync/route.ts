import { NextResponse } from 'next/server';

import { isCronAuthorized } from '@/lib/knowledge/brain/cronAuth';
import { runAnalyticsSync } from '@/lib/analytics/website/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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
 * Scheduler-compatible endpoint. No schedule is created by this change.
 * An external scheduler (Vercel Cron or an existing worker) must call it with
 * `Authorization: Bearer <CRON_SECRET>`.
 */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) return json({ error: 'Unauthorized' }, 401);

  try {
    const results = await runAnalyticsSync({ mode: 'incremental' });
    return json({ ok: true, results });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 200) : 'sync_failed',
      },
      500
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
