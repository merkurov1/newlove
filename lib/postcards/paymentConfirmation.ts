import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  normalizePierrotPostcardRef,
  pierrotConversationIdFromRef,
} from '@/lib/pierrot/orderAttribution';
import { recordPierrotEvent } from '@/lib/pierrot/serverStore';
import { recordPierrotPurchaseCompleted } from '@/lib/pierrot/commercialAnalytics';

/**
 * Existing postcard payment confirmation, extracted from the Stripe webhook so
 * the trusted branch can be tested without creating a second webhook.
 *
 * Only a verified `checkout.session.completed` event with `payment_status` of
 * `paid` may mark an order PAID. Creating a Checkout Session is never enough.
 */
export type PostcardPaymentOutcome =
  | { status: 'ignored'; reason: 'not_postcard' | 'unpaid' }
  | { status: 'duplicate'; orderId: string; orderStatus: string }
  | { status: 'confirmed'; orderId: string }
  | {
      status: 'rejected';
      code: 'missing_order' | 'not_found' | 'lookup_failed' | 'update_failed';
      orderId?: string;
    };

const COMPLETED_STATUSES = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

/**
 * Records attribution in the existing Pierrot event table. It is deliberately
 * best-effort: payment confirmation must not fail because analytics failed,
 * and the event contains no email, address or personal message.
 */
async function recordConfirmedOrderAttribution(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session,
  orderId: string
): Promise<void> {
  const ref = normalizePierrotPostcardRef(session.metadata?.pierrotAttribution);
  const conversationId = pierrotConversationIdFromRef(ref);

  if (!conversationId) return;

  try {
    const { data, error } = await supabase
      .from('pierrot_conversations')
      .select('session_id')
      .eq('id', conversationId)
      .maybeSingle();

    if (error || !data || typeof data.session_id !== 'string') return;

    await recordPierrotEvent(supabase, {
      conversationId,
      sessionId: data.session_id,
      eventName: 'order_paid',
      // A repeated Stripe event reuses the same key and cannot insert twice.
      eventKey: `order_paid:${session.id}`,
      payload: {
        order_id: orderId,
        offer_id: 'heart_angel_postcard',
        product_id: 'heart_angel_postcard',
        amount_total: typeof session.amount_total === 'number' ? session.amount_total : null,
        currency: typeof session.currency === 'string' ? session.currency : null,
      },
    });

    await recordPierrotPurchaseCompleted(supabase, {
      conversationId,
      eventKey: `purchase_completed:${session.id}`,
      offerId: 'heart_angel_postcard',
      orderId,
      providerSessionId: session.id,
      amountTotal: typeof session.amount_total === 'number' ? session.amount_total : null,
      currency: typeof session.currency === 'string' ? session.currency : null,
      source: 'postcard_webhook',
    });
  } catch {
    // Attribution is optional and must never change payment handling.
  }
}

export async function confirmPostcardCheckoutSession(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<PostcardPaymentOutcome> {
  const metadata = session.metadata || {};

  if (metadata.type !== 'postcard_v1') {
    return { status: 'ignored', reason: 'not_postcard' };
  }

  if (session.payment_status !== 'paid') {
    return { status: 'ignored', reason: 'unpaid' };
  }

  const orderId = metadata.orderId;

  if (!orderId) {
    return { status: 'rejected', code: 'missing_order' };
  }

  const { data: order, error: lookupError } = await supabase
    .from('postcard_orders')
    .select('id, status')
    .eq('id', orderId)
    .maybeSingle();

  if (lookupError) {
    return { status: 'rejected', code: 'lookup_failed', orderId };
  }

  if (!order) {
    return { status: 'rejected', code: 'not_found', orderId };
  }

  if (COMPLETED_STATUSES.includes(order.status)) {
    return { status: 'duplicate', orderId, orderStatus: order.status };
  }

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null;

  const { error: updateError } = await supabase
    .from('postcard_orders')
    .update({
      status: 'PAID',
      stripePaymentIntentId: paymentIntentId,
      updatedAt: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateError) {
    return { status: 'rejected', code: 'update_failed', orderId };
  }

  await recordConfirmedOrderAttribution(supabase, session, orderId);

  return { status: 'confirmed', orderId };
}
