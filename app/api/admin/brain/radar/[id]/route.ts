import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createBrainGraphStore } from '@/lib/knowledge/graph/store';

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

const STATUSES = new Set(['pending', 'approved', 'dismissed']);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainGraphStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = typeof body.status === 'string' ? body.status : '';

  if (!STATUSES.has(status)) {
    return json({ error: 'status must be pending, approved or dismissed.' }, 400);
  }

  try {
    const { data, error } = await store.client
      .from('brain_editorial_suggestions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    if (!data) return json({ error: 'Suggestion not found.' }, 404);

    return json({ status: 'ok', suggestion: data });
  } catch {
    return json({ error: 'Could not update the suggestion.' }, 503);
  }
}
