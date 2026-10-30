import type { SupabaseClient } from '@supabase/supabase-js';
import type { PierrotCommercialPlan } from '@/lib/pierrot/commercial';
import type { PierrotIntent } from '@/lib/pierrot/intents';
import { recordPierrotEvent, recordPierrotEventByConversationId } from '@/lib/pierrot/serverStore';

type CommercialAnalyticsInput = {
  conversationId: string;
  sessionId: string;
  userMessageId: string;
  intent: PierrotIntent;
  plan: PierrotCommercialPlan;
};

function offerAttribution(input: CommercialAnalyticsInput, at: string): Record<string, unknown> {
  const { plan, intent, conversationId } = input;
  const offer = plan.offer;
  const offerId = offer?.id ?? plan.cta?.offerId ?? null;

  return {
    product_id: offerId,
    offer_id: offerId,
    recommendation_reason:
      plan.recommendationReason ?? plan.commercialReason ?? (offer ? offer.summary : null),
    source_page: plan.sourcePage,
    conversation_id: conversationId,
    triggering_intent: intent.name,
    recommendation_at: at,
  };
}

/**
 * Pre-generation commercial events. `offer_shown` and `cta_shown` are written
 * only after a response is actually produced by recordPierrotOfferShown().
 * `offer_viewed` is a client event written when the rendered offer enters the
 * viewport; displayed, selected, viewed and purchased are never conflated.
 */
export async function recordPierrotCommercialAnalytics(
  store: SupabaseClient,
  input: CommercialAnalyticsInput
): Promise<void> {
  const { conversationId, sessionId, userMessageId, intent, plan } = input;
  const at = new Date().toISOString();

  const record = async (
    eventName: Parameters<typeof recordPierrotEvent>[1]['eventName'],
    eventKey: string,
    payload: Record<string, unknown>
  ): Promise<void> => {
    try {
      await recordPierrotEvent(store, {
        conversationId,
        sessionId,
        eventName,
        eventKey,
        payload,
      });
    } catch {
      // Analytics is best-effort; chat and checkout must continue.
    }
  };

  await record('intent_classified', `intent_classified:${userMessageId}`, {
    intent: intent.name,
    confidence: intent.confidence,
    uncertain: intent.uncertain,
    offer_id: intent.offerId ?? null,
    topic: intent.topic,
    access_request: intent.accessRequest,
    publisher_intent: intent.publisherIntent,
    declined: intent.declined,
    stage: plan.commercialStage,
  });

  const commercialIntent = [
    'purchase_intent',
    'subscription_intent',
    'offer_information',
    'book_inquiry',
    'service_inquiry',
    'handoff_request',
  ].includes(intent.name);
  const interestDetected =
    Boolean(plan.offer) ||
    plan.proactive ||
    plan.commercialStage !== 'exploration' ||
    commercialIntent;

  if (interestDetected) {
    await record('interest_detected', `interest_detected:${userMessageId}`, {
      intent: intent.name,
      topic: intent.topic,
      stage: plan.commercialStage,
      declined: intent.declined,
      ...offerAttribution(input, at),
    });
  }

  if (plan.offerSelected && plan.offer) {
    await record('offer_eligible', `offer_eligible:${userMessageId}:${plan.offer.id}`, {
      intent: intent.name,
      stage: plan.commercialStage,
      proactive: plan.proactive,
      ...offerAttribution(input, at),
    });
    await record('offer_selected', `offer_selected:${userMessageId}:${plan.offer.id}`, {
      intent: intent.name,
      stage: plan.commercialStage,
      proactive: plan.proactive,
      ...offerAttribution(input, at),
    });
  }

  if (plan.commercialDeclined) {
    await record('commercial_declined', `commercial_declined:${userMessageId}`, {
      intent: intent.name,
      offer_id: plan.declinedOfferId ?? intent.offerId ?? null,
      product_id: plan.declinedOfferId ?? intent.offerId ?? null,
      source_page: plan.sourcePage,
      recommendation_at: at,
    });
  }

  if (plan.commercialReturned) {
    await record('commercial_returned', `commercial_returned:${userMessageId}`, {
      from_offer_id: plan.commercialReturned.fromOfferId,
      section_id: plan.commercialReturned.sectionId,
      source_page: plan.sourcePage,
      recommendation_at: at,
    });
  }
}

/**
 * Post-generation events. Call this only after a non-error response has been
 * produced. The client separately records `offer_viewed` when the offer is
 * actually visible.
 */
export async function recordPierrotOfferShown(
  store: SupabaseClient,
  input: CommercialAnalyticsInput
): Promise<void> {
  const { conversationId, sessionId, userMessageId, intent, plan } = input;

  if (!plan.offer || !plan.offerSelected) return;

  const at = new Date().toISOString();

  const record = async (
    eventName: Parameters<typeof recordPierrotEvent>[1]['eventName'],
    eventKey: string,
    payload: Record<string, unknown>
  ): Promise<void> => {
    try {
      await recordPierrotEvent(store, {
        conversationId,
        sessionId,
        eventName,
        eventKey,
        payload,
      });
    } catch {
      // Analytics is best-effort; chat must continue.
    }
  };

  await record('offer_shown', `offer_shown:${userMessageId}:${plan.offer.id}`, {
    intent: intent.name,
    stage: plan.commercialStage,
    proactive: plan.proactive,
    has_cta: Boolean(plan.cta),
    ...offerAttribution(input, at),
  });

  if (plan.ctaShown && plan.cta) {
    await record('cta_shown', `cta_shown:${userMessageId}:${plan.cta.offerId}`, {
      offer_id: plan.cta.offerId,
      product_id: plan.cta.offerId,
      cta_kind: plan.cta.kind,
      destination: plan.cta.href,
      purpose: plan.cta.purpose,
      stage: plan.commercialStage,
      proactive: plan.proactive,
      source_page: plan.sourcePage,
      conversation_id: conversationId,
      triggering_intent: intent.name,
      recommendation_at: at,
    });
  }
}

export type PierrotPurchaseConfirmationInput = {
  conversationId: string;
  eventKey: string;
  offerId: string;
  orderId?: string | null;
  providerSessionId?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  source: 'postcard_webhook' | 'unframed_webhook' | 'unframed_verify';
};

/**
 * Unified confirmed-purchase event. It is written only by trusted payment
 * handlers, never by a CTA or checkout initiation.
 */
export async function recordPierrotPurchaseCompleted(
  store: SupabaseClient,
  input: PierrotPurchaseConfirmationInput
): Promise<boolean> {
  try {
    return await recordPierrotEventByConversationId(store, {
      conversationId: input.conversationId,
      eventName: 'purchase_completed',
      eventKey: input.eventKey,
      payload: {
        product_id: input.offerId,
        offer_id: input.offerId,
        order_id: input.orderId ?? null,
        provider_session_id: input.providerSessionId ?? null,
        amount_total: input.amountTotal ?? null,
        currency: input.currency ?? null,
        source: input.source,
        completed_at: new Date().toISOString(),
      },
    });
  } catch {
    return false;
  }
}
