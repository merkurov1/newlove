import { NextResponse } from 'next/server';

import { clearMediaIntelligenceCache } from '@/lib/analytics/mediaIntelligence';
import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createMediaAnalysisStore } from '@/lib/knowledge/media/analysisStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;

  if (!UUID_PATTERN.test(id)) return json({ error: 'Invalid analysis run id.' }, 400);

  const body = await request.json().catch(() => ({}));
  const action =
    body && typeof body === 'object' && typeof (body as { action?: unknown }).action === 'string'
      ? (body as { action: string }).action
      : '';

  if (action !== 'retry' && action !== 'cancel') {
    return json({ error: 'Unsupported action.' }, 400);
  }

  const store = createMediaAnalysisStore();

  if (!store) return json({ error: 'Media analysis database is not configured.' }, 503);

  try {
    const updated =
      action === 'retry' ? await store.retryRun(id) : await store.cancelRun(id);

    if (!updated) return json({ error: 'Run cannot be changed in its current state.' }, 409);

    clearMediaIntelligenceCache();

    return json({ status: 'ok', action });
  } catch {
    return json({ error: 'Could not update analysis run.' }, 503);
  }
}
