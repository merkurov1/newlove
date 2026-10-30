import type { SupabaseClient } from '@supabase/supabase-js';

import { isPierrotOfferId, type PierrotOfferId } from '@/lib/pierrot/offers';

export type PierrotOfferPolicy = {
  offerId: PierrotOfferId;
  enabled: boolean;
  priority: number;
  maxShowsPerConversation: number;
  cooldownTurns: number;
  cooldownSeconds: number;
  minInterestScore: number;
  requiresRepeatedEngagement: boolean;
  allowProactive: boolean;
  recommendationCopy: string | null;
};

export type PierrotOfferPolicyMap = Partial<Record<PierrotOfferId, PierrotOfferPolicy>>;

const DEFAULT_POLICIES: Record<PierrotOfferId, PierrotOfferPolicy> = {
  heart_angel_postcard: {
    offerId: 'heart_angel_postcard',
    enabled: true,
    priority: 30,
    maxShowsPerConversation: 3,
    cooldownTurns: 2,
    cooldownSeconds: 45,
    minInterestScore: 1.5,
    requiresRepeatedEngagement: false,
    allowProactive: true,
    recommendationCopy: null,
  },
  unframed: {
    offerId: 'unframed',
    enabled: true,
    priority: 20,
    maxShowsPerConversation: 3,
    cooldownTurns: 2,
    cooldownSeconds: 60,
    minInterestScore: 1.5,
    requiresRepeatedEngagement: false,
    allowProactive: true,
    recommendationCopy: null,
  },
  journal_flow: {
    offerId: 'journal_flow',
    enabled: true,
    priority: 10,
    maxShowsPerConversation: 2,
    cooldownTurns: 4,
    cooldownSeconds: 120,
    // A single factual question should not be enough for a proactive pitch.
    minInterestScore: 2.5,
    requiresRepeatedEngagement: true,
    allowProactive: true,
    recommendationCopy: null,
  },
  art_engine: {
    offerId: 'art_engine',
    enabled: true,
    priority: 5,
    maxShowsPerConversation: 1,
    cooldownTurns: 8,
    cooldownSeconds: 300,
    minInterestScore: 99,
    requiresRepeatedEngagement: false,
    allowProactive: false,
    recommendationCopy: null,
  },
  advising: {
    offerId: 'advising',
    enabled: true,
    priority: 5,
    maxShowsPerConversation: 1,
    cooldownTurns: 8,
    cooldownSeconds: 300,
    minInterestScore: 99,
    requiresRepeatedEngagement: false,
    allowProactive: false,
    recommendationCopy: null,
  },
};

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(parsed)) return fallback;

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

export function normalizePierrotOfferPolicy(
  offerId: PierrotOfferId,
  value: unknown
): PierrotOfferPolicy {
  const fallback = DEFAULT_POLICIES[offerId];
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    offerId,
    enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback.enabled,
    priority: clampInteger(record.priority, fallback.priority, 0, 1000),
    maxShowsPerConversation: clampInteger(
      record.maxShowsPerConversation,
      fallback.maxShowsPerConversation,
      1,
      20
    ),
    cooldownTurns: clampInteger(record.cooldownTurns, fallback.cooldownTurns, 0, 50),
    cooldownSeconds: clampInteger(record.cooldownSeconds, fallback.cooldownSeconds, 0, 86_400),
    minInterestScore:
      typeof record.minInterestScore === 'number' && Number.isFinite(record.minInterestScore)
        ? Math.max(0, Math.min(100, record.minInterestScore))
        : fallback.minInterestScore,
    requiresRepeatedEngagement:
      typeof record.requiresRepeatedEngagement === 'boolean'
        ? record.requiresRepeatedEngagement
        : fallback.requiresRepeatedEngagement,
    allowProactive:
      typeof record.allowProactive === 'boolean' ? record.allowProactive : fallback.allowProactive,
    recommendationCopy:
      typeof record.recommendationCopy === 'string' && record.recommendationCopy.trim()
        ? record.recommendationCopy.trim().slice(0, 300)
        : fallback.recommendationCopy,
  };
}

/**
 * Optional owner override. This is intentionally JSON-in-env rather than a new
 * product catalogue: prices, availability and checkout remain in the existing
 * postcards/subscribers/payment sources.
 *
 * Example:
 * PIERROT_OFFER_POLICY_JSON={"heart_angel_postcard":{"maxShowsPerConversation":2}}
 */
export function loadPierrotOfferPolicies(
  env: Record<string, string | undefined> = process.env
): PierrotOfferPolicyMap {
  const raw = (env.PIERROT_OFFER_POLICY_JSON || '').trim();

  if (!raw) return { ...DEFAULT_POLICIES };

  try {
    const parsed: unknown = JSON.parse(raw);
    const record =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};

    const result: PierrotOfferPolicyMap = { ...DEFAULT_POLICIES };

    for (const key of Object.keys(record)) {
      if (!isPierrotOfferId(key)) continue;
      result[key] = normalizePierrotOfferPolicy(key, record[key]);
    }

    return result;
  } catch {
    return { ...DEFAULT_POLICIES };
  }
}

export function getPierrotOfferPolicy(
  offerId: PierrotOfferId,
  policies: PierrotOfferPolicyMap | null | undefined = null
): PierrotOfferPolicy {
  return policies?.[offerId] ?? DEFAULT_POLICIES[offerId];
}

/**
 * Loads owner overrides from Supabase, falling back to env/defaults when the
 * table is unavailable. Product availability is still checked separately.
 */
export async function loadPierrotOfferPoliciesFromStore(
  store: SupabaseClient | null | undefined,
  env: Record<string, string | undefined> = process.env
): Promise<PierrotOfferPolicyMap> {
  const fallback = loadPierrotOfferPolicies(env);

  if (!store) return fallback;

  try {
    const { data, error } = await store.from('pierrot_offer_policies').select('*').limit(20);

    if (error || !Array.isArray(data)) return fallback;

    const result: PierrotOfferPolicyMap = { ...fallback };

    for (const row of data) {
      if (!row || typeof row !== 'object') continue;

      const record = row as Record<string, unknown>;
      const offerId = record.offer_id;

      if (!isPierrotOfferId(offerId)) continue;

      result[offerId] = normalizePierrotOfferPolicy(offerId, {
        enabled: record.enabled,
        priority: record.priority,
        maxShowsPerConversation: record.max_shows_per_conversation,
        cooldownTurns: record.cooldown_turns,
        cooldownSeconds: record.cooldown_seconds,
        minInterestScore: record.min_interest_score,
        requiresRepeatedEngagement: record.requires_repeated_engagement,
        allowProactive: record.allow_proactive,
        recommendationCopy: record.recommendation_copy,
      });
    }

    return result;
  } catch {
    return fallback;
  }
}

export function isPierrotOfferEnabled(
  offerId: PierrotOfferId,
  policies?: PierrotOfferPolicyMap | null
): boolean {
  return getPierrotOfferPolicy(offerId, policies).enabled;
}
