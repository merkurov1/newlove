import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createMediaAnalysisStore } from '@/lib/knowledge/media/analysisStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VERIFICATION_STATUSES = [
  'unverified',
  'needs_review',
  'verified',
  'rejected',
] as const;
const ATTRIBUTIONS = ['anton_merkurov', 'other', 'unknown'] as const;
const TRANSLATION_STATUSES = ['none', 'draft', 'verified', 'rejected'] as const;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function oneOf<T extends readonly string[]>(values: T, value: unknown): value is T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> }
) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const { quoteId } = await params;

  if (!/^mq_[a-f0-9]{32}$/.test(quoteId)) {
    return json({ error: 'Invalid quote id.' }, 400);
  }

  const body = await request.json().catch(() => ({}));

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const value = body as Record<string, unknown>;
  const verificationStatus = oneOf(VERIFICATION_STATUSES, value.verification_status)
    ? value.verification_status
    : undefined;
  const attribution = oneOf(ATTRIBUTIONS, value.attribution)
    ? value.attribution
    : undefined;
  const translationStatus = oneOf(TRANSLATION_STATUSES, value.translation_status)
    ? value.translation_status
    : undefined;

  if (
    value.verification_status !== undefined &&
    !verificationStatus
  ) {
    return json({ error: 'Invalid verification status.' }, 400);
  }

  if (value.attribution !== undefined && !attribution) {
    return json({ error: 'Invalid attribution.' }, 400);
  }

  if (value.translation_status !== undefined && !translationStatus) {
    return json({ error: 'Invalid translation status.' }, 400);
  }

  const store = createMediaAnalysisStore();

  if (!store) return json({ error: 'Media analysis database is not configured.' }, 503);

  try {
    await store.reviewQuote(quoteId, {
      verificationStatus,
      attribution,
      attributionNote:
        typeof value.attribution_note === 'string'
          ? value.attribution_note.slice(0, 1000)
          : value.attribution_note === null
            ? null
            : undefined,
      translation:
        typeof value.translation === 'string'
          ? value.translation.slice(0, 4000)
          : value.translation === null
            ? null
            : undefined,
      translationLanguage:
        typeof value.translation_language === 'string'
          ? value.translation_language.slice(0, 16)
          : value.translation_language === null
            ? null
            : undefined,
      translationStatus,
      reviewedBy: auth.actor,
    });

    return json({ status: 'ok' });
  } catch {
    return json({ error: 'Could not update quote review.' }, 503);
  }
}
