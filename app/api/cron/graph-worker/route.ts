import { NextResponse } from 'next/server';

import { isCronAuthorized } from '@/lib/knowledge/brain/cronAuth';
import { runGraphWorker } from '@/lib/knowledge/brain/worker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

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

  try {
    const result = await runGraphWorker({ trigger: 'cron' });
    return json({ status: 'ok', result });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'graph_worker_failed';

    console.error('[Graph cron worker]', { code });

    return json(
      { error: code },
      code === 'graph_llm_not_configured' || code === 'brain_graph_database_unavailable'
        ? 503
        : 500
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
