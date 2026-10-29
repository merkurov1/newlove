import type { SupabaseClient } from '@supabase/supabase-js';
import type { PierrotCommercialPlan } from '@/lib/pierrot/commercial';
import type { PierrotIntent } from '@/lib/pierrot/intents';
import { recordPierrotEvent } from '@/lib/pierrot/serverStore';

type CommercialAnalyticsInput = {
  conversationId: string;
  sessionId: string;
  userMessageId: string;
  intent: PierrotIntent;
  plan: PierrotCommercialPlan;
};

/**
 * Server-side analytics only. Event keys include the user message id, so an
 * HTTP retry or a duplicate request cannot insert the same event twice.
 *
 * `offer_selected` is the planner decision. `offer_viewed` and `cta_shown` are
 * rendered artefacts. None of them is treated as a sale; confirmation comes
 * only from the existing payment/confirmation handlers.
 */
export async function recordPierrotCommercialAnalytics(
  store: SupabaseClient,
  input: CommercialAnalyticsInput
): Promise<void> {
  const { conversationId, sessionId, userMessageId, intent, plan } = input;

  await recordPierrotEvent(store, {
    conversationId,
    sessionId,
    eventName: 'intent_classified',
    eventKey: `intent_classified:${userMessageId}`,
    payload: {
      intent: intent.name,
      confidence: intent.confidence,
      uncertain: intent.uncertain,
      offer_id: intent.offerId ?? null,
      topic: intent.topic,
      access_request: intent.accessRequest,
      publisher_intent: intent.publisherIntent,
      declined: intent.declined,
      stage: plan.commercialStage,
    },
  });

  if (plan.offerSelected && plan.offer) {
    await recordPierrotEvent(store, {
      conversationId,
      sessionId,
      eventName: 'offer_selected',
      eventKey: `offer_selected:${userMessageId}:${plan.offer.id}`,
      payload: {
        offer_id: plan.offer.id,
        intent: intent.name,
        stage: plan.commercialStage,
        proactive: plan.proactive,
        reason: plan.proactive ? (plan.commercialReason ?? null) : null,
      },
    });
  }

  if (plan.offerViewed && plan.offer) {
    await recordPierrotEvent(store, {
      conversationId,
      sessionId,
      eventName: 'offer_viewed',
      eventKey: `offer_viewed:${userMessageId}:${plan.offer.id}`,
      payload: {
        offer_id: plan.offer.id,
        intent: intent.name,
        confidence: intent.confidence,
        stage: plan.commercialStage,
        proactive: plan.proactive,
      },
    });
  }

  if (plan.ctaShown && plan.cta) {
    await recordPierrotEvent(store, {
      conversationId,
      sessionId,
      eventName: 'cta_shown',
      eventKey: `cta_shown:${userMessageId}:${plan.cta.offerId}`,
      payload: {
        offer_id: plan.cta.offerId,
        cta_kind: plan.cta.kind,
        destination: plan.cta.href,
        purpose: plan.cta.purpose,
        stage: plan.commercialStage,
        proactive: plan.proactive,
      },
    });
  }

  if (plan.commercialDeclined) {
    await recordPierrotEvent(store, {
      conversationId,
      sessionId,
      eventName: 'commercial_declined',
      eventKey: `commercial_declined:${userMessageId}`,
      payload: {
        intent: intent.name,
        offer_id: plan.declinedOfferId ?? intent.offerId ?? null,
      },
    });
  }

  if (plan.commercialReturned) {
    await recordPierrotEvent(store, {
      conversationId,
      sessionId,
      eventName: 'commercial_returned',
      eventKey: `commercial_returned:${userMessageId}`,
      payload: {
        from_offer_id: plan.commercialReturned.fromOfferId,
        section_id: plan.commercialReturned.sectionId,
      },
    });
  }
}
