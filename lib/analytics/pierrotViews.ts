import type { SupabaseClient } from '@supabase/supabase-js';

export type PierrotViewMetrics = {
  overview: unknown[];
  byPage: unknown[];
  byLanguage: unknown[];
  intents: unknown[];
  navigation: unknown[];
  offerFunnel: unknown[];
  productInterest: unknown[];
  durations: unknown[];
  retrievalFailures: unknown[];
  unanswered: unknown[];
  quality: unknown[];
};

async function readView(store: SupabaseClient, view: string, limit = 500): Promise<unknown[]> {
  const { data, error } = await store.from(view).select('*').limit(limit);

  if (error) throw new Error(`${view}: ${error.message}`);

  return Array.isArray(data) ? data : [];
}

/**
 * Owner-only aggregate reads. These views are service-role only; they never
 * expose raw events or transcripts to public visitors.
 */
export async function loadPierrotViewMetrics(store: SupabaseClient): Promise<PierrotViewMetrics> {
  const [
    overview,
    byPage,
    byLanguage,
    intents,
    navigation,
    offerFunnel,
    productInterest,
    durations,
    retrievalFailures,
    unanswered,
    quality,
  ] = await Promise.all([
    readView(store, 'pierrot_v_conversation_overview', 5000),
    readView(store, 'pierrot_v_conversations_by_page'),
    readView(store, 'pierrot_v_conversations_by_language'),
    readView(store, 'pierrot_v_intent_distribution'),
    readView(store, 'pierrot_v_navigation_destinations'),
    readView(store, 'pierrot_v_offer_funnel'),
    readView(store, 'pierrot_v_product_interest'),
    readView(store, 'pierrot_v_conversation_duration', 5000),
    readView(store, 'pierrot_v_retrieval_failures'),
    readView(store, 'pierrot_v_unanswered_questions', 500),
    readView(store, 'pierrot_v_quality_indicators', 5000),
  ]);

  return {
    overview,
    byPage,
    byLanguage,
    intents,
    navigation,
    offerFunnel,
    productInterest,
    durations,
    retrievalFailures,
    unanswered,
    quality,
  };
}
