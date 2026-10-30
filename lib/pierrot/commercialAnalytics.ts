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
 *
 * One rejected event (for example, a migration that has not been applied yet)
 * must not prevent the remaining events in the same turn from being recorded.
 */
export async function recordPierrotCommercialAnalytics(
  store: SupabaseClient,
  input: CommercialAnalyticsInput
): Promise<void> {
  const { conversationId, sessionId, userMessageId, intent, plan } = input;

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

  if (plan.offerSelected && plan.offer) {
    await record('offer_selected', `offer_selected:${userMessageId}:${plan.offer.id}`, {
      offer_id: plan.offer.id,
      intent: intent.name,
      stage: plan.commercialStage,
      proactive: plan.proactive,
      reason: plan.proactive ? plan.commercialReason ?? null : null,
    });
  }

  if (plan.offerViewed && plan.offer) {
    await record('offer_viewed', `offer_viewed:${userMessageId}:${plan.offer.id}`, {
      offer_id: plan.offer.id,
      intent: intent.name,
      confidence: intent.confidence,
      stage: plan.commercialStage,
      proactive: plan.proactive,
    });
  }

  if (plan.ctaShown && plan.cta) {
    await record('cta_shown', `cta_shown:${userMessageId}:${plan.cta.offerId}`, {
      offer_id: plan.cta.offerId,
      cta_kind: plan.cta.kind,
      destination: plan.cta.href,
      purpose: plan.cta.purpose,
      stage: plan.commercialStage,
      proactive: plan.proactive,
    });
  }

  if (plan.commercialDeclined) {
    await record('commercial_declined', `commercial_declined:${userMessageId}`, {
      intent: intent.name,
      offer_id: plan.declinedOfferId ?? intent.offerId ?? null,
    });
  }

  if (plan.commercialReturned) {
    await record('commercial_returned', `commercial_returned:${userMessageId}`, {
      from_offer_id: plan.commercialReturned.fromOfferId,
      section_id: plan.commercialReturned.sectionId,
    });
  }
}
