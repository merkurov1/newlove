import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { loadWorkerDashboard } from '@/lib/knowledge/brain/workerTelemetry';

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

export async function GET(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  try {
    const dashboard = await loadWorkerDashboard();
    return json({ status: 'ok', dashboard });
  } catch (error) {
    console.error('[Brain worker status]', {
      code: error instanceof Error ? error.message : 'worker_status_failed',
    });

    return json({ error: 'Could not load worker status.' }, 503);
  }
}
