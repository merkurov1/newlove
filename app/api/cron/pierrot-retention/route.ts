import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { isCronAuthorized } from '@/lib/knowledge/brain/cronAuth';
import { beginWorkerInvocation } from '@/lib/operations/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
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

async function handle(request: Request) {
  if (!isCronAuthorized(request)) return json({ error: 'Unauthorized' }, 401);

  const guard = await beginWorkerInvocation({
    scope: 'retention',
    trigger: 'admin',
    workerId: `pierrot-retention-${Date.now().toString(36)}`,
    maxDurationMs: 55_000,
  });

  if (!guard.ok) {
    return json({ status: 'skipped', reason: guard.reason }, 200);
  }

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) return json({ error: 'Storage is not configured.' }, 503);

    const store = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });

    try {
      const { data, error } = await store.rpc('purge_expired_pierrot_conversations');

      if (error) {
        console.error('[Pierrot retention] purge failed');
        return json({ error: 'Retention purge failed.' }, 503);
      }

      const staleBefore = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

      try {
        await store.from('pierrot_rate_limits').delete().lt('window_started_at', staleBefore);
      } catch {
        // Rate-limit cleanup is best effort and must not fail the purge.
      }

      return json({
        status: 'ok',
        purged: typeof data === 'number' ? data : null,
        ranAt: new Date().toISOString(),
      });
    } catch {
      console.error('[Pierrot retention] purge failed');
      return json({ error: 'Retention purge failed.' }, 503);
    }
  } finally {
    await guard.finish({ status: 'completed' });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
