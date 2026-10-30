import { NextResponse } from 'next/server';

import {
  getPierrotOfferPolicy,
  loadPierrotOfferPoliciesFromStore,
  normalizePierrotOfferPolicy,
} from '@/lib/pierrot/offerPolicy';
import { isPierrotOfferId, PIERROT_OFFER_IDS } from '@/lib/pierrot/offers';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';

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

function serialize(offerId: (typeof PIERROT_OFFER_IDS)[number]) {
  return getPierrotOfferPolicy(offerId);
}

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const policies = await loadPierrotOfferPoliciesFromStore(store);

    return json({
      status: 'ok',
      offers: PIERROT_OFFER_IDS.map((offerId) => ({
        ...serialize(offerId),
        ...policies[offerId],
      })),
    });
  } catch {
    return json({ error: 'Could not read offer policies.' }, 503);
  }
}

export async function PATCH(request: Request) {
  let actor = 'admin';

  try {
    const admin = await requireAdminFromRequest(request);
    actor = admin.id;
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid policy payload.' }, 400);
  }

  const record = body as Record<string, unknown>;
  const offerId = record.offerId;

  if (!isPierrotOfferId(offerId)) {
    return json({ error: 'Unknown offer.' }, 400);
  }

  const patch =
    record.patch && typeof record.patch === 'object' && !Array.isArray(record.patch)
      ? (record.patch as Record<string, unknown>)
      : record;

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const policies = await loadPierrotOfferPoliciesFromStore(store);
    const current = policies[offerId] ?? getPierrotOfferPolicy(offerId);
    const next = normalizePierrotOfferPolicy(offerId, {
      ...current,
      ...patch,
    });

    const { error } = await store.from('pierrot_offer_policies').upsert(
      {
        offer_id: offerId,
        enabled: next.enabled,
        priority: next.priority,
        max_shows_per_conversation: next.maxShowsPerConversation,
        cooldown_turns: next.cooldownTurns,
        cooldown_seconds: next.cooldownSeconds,
        min_interest_score: next.minInterestScore,
        requires_repeated_engagement: next.requiresRepeatedEngagement,
        allow_proactive: next.allowProactive,
        recommendation_copy: next.recommendationCopy,
        updated_at: new Date().toISOString(),
        updated_by: actor,
      },
      { onConflict: 'offer_id' }
    );

    if (error) throw error;

    return json({ status: 'ok', offer: next });
  } catch {
    return json({ error: 'Could not update the offer policy.' }, 503);
  }
}
