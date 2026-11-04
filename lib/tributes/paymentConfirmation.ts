import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  normalizePierrotTributeRef,
  pierrotConversationIdFromTributeRef,
} from '@/lib/pierrot/orderAttribution';
import { recordPierrotDonationCompleted } from '@/lib/pierrot/commercialAnalytics';

/**
 * Trusted Tribute confirmation.
 *
 * Only a verified Stripe event or a server-side Stripe session retrieval with
 * `payment_status === 'paid'` may create a Tribute row or a
 * `donation_completed` analytics event. Browser-supplied amounts and statuses
 * are never used here.
 */
export type TributePaymentOutcome =
  | { status: 'ignored'; reason: 'not_tribute' | 'unpaid' }
  | { status: 'duplicate'; sessionId: string }
  | { status: 'confirmed'; sessionId: string }
  | {
      status: 'rejected';
      code: 'lookup_failed' | 'insert_failed' | 'missing_amount';
      sessionId: string;
    };

async function recordDonationAttribution(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<void> {
  const conversationId = pierrotConversationIdFromTributeRef(
    normalizePierrotTributeRef(session.metadata?.pierrotAttribution)
  );

  if (!conversationId) return;

  await recordPierrotDonationCompleted(supabase, {
    conversationId,
    // A repeated webhook reuses the same key and cannot insert twice.
    eventKey: `donation_completed:${session.id}`,
    offerId: 'temple_tribute',
    providerSessionId: session.id,
    amountTotal: typeof session.amount_total === 'number' ? session.amount_total : null,
    currency: typeof session.currency === 'string' ? session.currency.toLowerCase() : null,
    source: 'tribute_webhook',
  });
}

/**
 * A single public, realtime-safe signal for the Tribute page.
 *
 * The browser must not subscribe to the private `tributes` table: realtime
 * payloads contain the full row (including provider session data). The public
 * temple log already exists for ritual events and only carries the display name
 * that the Tribute page is allowed to show.
 */
async function recordTributeTempleSignal(
  supabase: SupabaseClient,
  donorName: string
): Promise<void> {
  const { error } = await supabase.from('temple_log').insert({
    author: donorName,
    event_type: 'TRIBUTE',
    message: `${donorName} offered light to the Temple`,
    created_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('Tribute temple signal failed:', error.message);
  }
}

export async function confirmTributeCheckoutSession(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<TributePaymentOutcome> {
  const metadata = session.metadata || {};

  if (metadata.type !== 'tribute_v1') {
    return { status: 'ignored', reason: 'not_tribute' };
  }

  if (session.payment_status !== 'paid') {
    return { status: 'ignored', reason: 'unpaid' };
  }

  const amountCents = session.amount_total;

  if (!Number.isInteger(amountCents) || !amountCents || amountCents <= 0) {
    return { status: 'rejected', code: 'missing_amount', sessionId: session.id };
  }

  const currency =
    typeof session.currency === 'string' && session.currency.trim()
      ? session.currency.toLowerCase()
      : 'usd';

  const donorName =
    typeof metadata.donor_name === 'string' && metadata.donor_name.trim()
      ? metadata.donor_name.trim().slice(0, 120)
      : 'Anonymous';
  const message =
    typeof metadata.message === 'string' ? metadata.message.slice(0, 500) : '';

  // The unique index on tributes.stripe_session_id is the idempotency source
  // of truth. Attribution is retried on duplicates so a transient analytics
  // failure can be repaired without creating a second donation.
  const { data: existingTribute, error: lookupError } = await supabase
    .from('tributes')
    .select('id')
    .eq('stripe_session_id', session.id)
    .maybeSingle();

  if (lookupError) {
    return { status: 'rejected', code: 'lookup_failed', sessionId: session.id };
  }

  if (existingTribute) {
    await recordDonationAttribution(supabase, session);
    return { status: 'duplicate', sessionId: session.id };
  }

  const { error: insertError } = await supabase.from('tributes').insert({
    amount_cents: amountCents,
    currency,
    provider: 'stripe',
    status: 'succeeded',
    donor_name: donorName,
    message,
    stripe_session_id: session.id,
  });

  if (insertError) {
    if (insertError.code === '23505') {
      await recordDonationAttribution(supabase, session);
      return { status: 'duplicate', sessionId: session.id };
    }

    return { status: 'rejected', code: 'insert_failed', sessionId: session.id };
  }

  await recordTributeTempleSignal(supabase, donorName);
  await recordDonationAttribution(supabase, session);

  return { status: 'confirmed', sessionId: session.id };
}
