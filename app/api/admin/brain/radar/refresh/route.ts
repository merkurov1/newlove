import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';
import { runEditorialRadar } from '@/lib/knowledge/graph/radar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
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

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainGraphStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const body = await request.json().catch(() => ({}));
  const periodDays = typeof body.periodDays === 'number' ? body.periodDays : 90;
  const limit = typeof body.limit === 'number' ? body.limit : 200;

  try {
    const result = await runEditorialRadar({ store, periodDays, limit });
    return json({ status: 'ok', ...result });
  } catch (error) {
    console.error('[Brain radar refresh]', {
      code: error instanceof Error ? error.message : 'radar_failed',
    });

    return json({ error: 'Could not refresh the editorial radar.' }, 503);
  }
}
