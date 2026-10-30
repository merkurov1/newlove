import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createMediaAnalysisStore } from '@/lib/knowledge/media/analysisStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REVIEW_STATUSES = ['unverified', 'needs_review', 'confirmed', 'rejected'] as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ relationId: string }> }
) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const { relationId } = await params;

  if (!/^[0-9a-f-]{36}$/i.test(relationId)) {
    return json({ error: 'Invalid relation id.' }, 400);
  }

  const body = await request.json().catch(() => ({}));
  const reviewStatus =
    body && typeof body === 'object' && typeof body.review_status === 'string'
      ? body.review_status
      : '';

  if (!(REVIEW_STATUSES as readonly string[]).includes(reviewStatus)) {
    return json({ error: 'Invalid review status.' }, 400);
  }

  const store = createMediaAnalysisStore();

  if (!store) return json({ error: 'Media analysis database is not configured.' }, 503);

  try {
    await store.reviewRelation(relationId, {
      reviewStatus,
      reviewedBy: auth.actor,
    });

    return json({ status: 'ok' });
  } catch {
    return json({ error: 'Could not update relation review.' }, 503);
  }
}
