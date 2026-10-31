import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export type PierrotProduct =
  'heart_angel_postcard' | 'journal_flow' | 'art_engine' | 'unframed' | 'advising';

export type ConversationOutcome = 'purchase' | 'subscription' | 'lead' | 'error' | 'none';

export type AnalyticsFilters = {
  from: string;
  to: string;
  language?: string;
  intent?: string;
  product?: string;
  outcome?: string;
  error?: boolean;
  q?: string;
  limit?: number;
};

export type ConversationRow = {
  id: string;
  session_id?: string | null;
  status: string;
  language: string;
  start_page: string;
  started_at: string;
  updated_at?: string | null;
  ended_at?: string | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  message_index: number;
  provider?: string | null;
  created_at: string;
};

export type EventRow = {
  conversation_id: string;
  event_name: string;
  event_key: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type SubscriptionEventRow = {
  event_name: string;
  event_key: string;
  subscriber_id?: string | null;
  conversation_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type PostcardOrderRow = {
  id: string;
  status: string;
  amount: number | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadRow = {
  id: string;
  conversation_id: string;
  status: string;
  need_type: string | null;
  stage: string | null;
  timeline: string | null;
  summary: string | null;
  created_at: string;
  submitted_at?: string | null;
};

export type ConversationSummary = {
  id: string;
  startedAt: string;
  language: string;
  status: string;
  startPage: string;
  latestIntent: string | null;
  products: string[];
  outcomes: ConversationOutcome[];
  hasError: boolean;
  hasReply: boolean;
  lastMessageRole: 'user' | 'assistant' | null;
  ctaShown: string[];
  offersViewed: string[];
  ctaClicked: string[];
  topics: string[];
  href: string;
};

export type SubscriberStats = {
  total: number;
  confirmed: number;
  pending: number;
  unsubscribed: number;
};

export type PierrotAttentionItem = {
  id: string;
  title: string;
  reason: string;
  href: string;
  severity: 'low' | 'medium' | 'high';
};

export type FunnelStage = {
  key: string;
  label: string;
  value: number;
  note?: string;
};

export type Insight = {
  id: string;
  kind: 'observed' | 'hypothesis';
  title: string;
  detail: string;
  evidence: Array<{ label: string; href: string }>;
  period: { from: string; to: string };
  confidence: 'low' | 'medium' | 'high';
  sampleSize: number;
};

export type Recommendation = {
  id: string;
  problem: string;
  evidence: Array<{ label: string; href: string }>;
  recommendedChange: string;
  successCriterion: string;
  period: { from: string; to: string };
  confidence: 'low' | 'medium' | 'high';
  sampleSize: number;
};

export type PierrotSnapshot = {
  period: { from: string; to: string };
  filters: AnalyticsFilters;
  overview: {
    conversationsStarted: number;
    conversationsWithReplies: number;
    intents: Array<{ key: string; value: number }>;
    offerTransitions: Array<{ key: string; value: number }>;
    confirmedSubscriptions: number;
    confirmedPurchases: number;
    qualifiedLeads: number;
    errors: number;
    unresolved: number;
    answers: {
      replied: number;
      failed: number;
    };
    feedback: {
      up: number;
      down: number;
    };
    retrieval: {
      attempts: number;
      relevant: number;
      noMatch: number;
      unavailable: number;
      errors: number;
      contextUsed: number;
      media: number;
      documents: number;
      chunks: number;
      averageLatencyMs: number | null;
    };
    handover: {
      requested: number;
      accepted: number;
      declined: number;
      expired: number;
      messagesSent: number;
      messagesReceived: number;
    };
    subscribers: SubscriberStats;
  };
  volume: {
    conversations: number;
    messages: number;
    events: number;
    subscriptionEvents: number;
    leads: number;
    sampleSufficient: boolean;
  };
  funnels: Record<'postcard' | 'journal' | 'art_engine' | 'unframed', FunnelStage[]>;
  conversations: ConversationSummary[];
  attention: PierrotAttentionItem[];
  insights: Insight[];
  recommendations: Recommendation[];
  availableIntents: string[];
  availableProducts: string[];
};

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

function parseFilterDate(raw: string | undefined, endOfDay: boolean): Date | null {
  if (!raw) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizePeriod(fromRaw?: string, toRaw?: string): { from: string; to: string } {
  const now = new Date();
  const parsedTo = parseFilterDate(toRaw, true);
  const safeTo = parsedTo || now;
  const parsedFrom = parseFilterDate(fromRaw, false);
  const fallbackFrom = new Date(safeTo.getTime() - DEFAULT_DAYS * 86400000);
  const earliest = new Date(safeTo.getTime() - MAX_DAYS * 86400000);
  const candidateFrom = parsedFrom || fallbackFrom;

  return {
    from: (candidateFrom < earliest ? earliest : candidateFrom).toISOString(),
    to: safeTo.toISOString(),
  };
}

export function parseAnalyticsFilters(
  search: Record<string, string | string[] | undefined>
): AnalyticsFilters {
  const value = (key: string) => {
    const raw = search[key];
    return Array.isArray(raw) ? raw[0] : raw;
  };
  const period = normalizePeriod(value('from'), value('to'));
  const limitRaw = Number(value('limit') || 100);

  return {
    ...period,
    language: ['ru', 'en', 'und'].includes(String(value('language')))
      ? String(value('language'))
      : undefined,
    intent: value('intent') || undefined,
    product: value('product') || undefined,
    outcome: value('outcome') || undefined,
    error: value('error') === '1',
    q: value('q')?.trim().slice(0, 120) || undefined,
    limit: Number.isFinite(limitRaw) ? Math.min(200, Math.max(20, limitRaw)) : 100,
  };
}

function payloadString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
}

function payloadNumber(payload: Record<string, unknown> | null, key: string): number {
  const value = payload?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function payloadCount(payload: Record<string, unknown> | null, countKey: string, listKey: string): number {
  const explicit = payloadNumber(payload, countKey);
  if (explicit > 0) return explicit;
  const list = payload?.[listKey];
  return Array.isArray(list) ? list.length : 0;
}

export function redactPersonalData(value: string): string {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/\b(?:\+?\d[\d ()-]{7,}\d)\b/g, '[phone]')
    .replace(/\b(?:sk|pk|api|rk|sbp)[-_][A-Za-z0-9_-]{16,}\b/gi, '[secret]')
    .slice(0, 2000);
}

function normalizeQuestion(value: string): string {
  return redactPersonalData(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”"'`]/g, '')
    .replace(/[?!.,;:]+$/g, '')
    .trim()
    .slice(0, 180);
}

function isQuestionLike(value: string): boolean {
  const text = value.trim().toLowerCase();
  return (
    text.includes('?') ||
    /^(what|how|why|when|where|who|which|can|could|is|are|do|does|что|как|почему|когда|где|кто|можно)\b/.test(
      text
    )
  );
}

function confidenceFor(sampleSize: number, hits: number): 'low' | 'medium' | 'high' {
  if (sampleSize >= 50 && hits >= 8) return 'high';
  if (sampleSize >= 20 && hits >= 3) return 'medium';
  return 'low';
}

function evidence(conversations: string[], limit = 5): Array<{ label: string; href: string }> {
  return conversations.slice(0, limit).map((id) => ({
    label: `Conversation ${id.slice(-8)}`,
    href: `/admin/pierrot?conversation=${encodeURIComponent(id)}`,
  }));
}

function countUnique(values: string[]): number {
  return new Set(values).size;
}

function increment(map: Map<string, number>, key: string | null, amount = 1): void {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function toSorted(map: Map<string, number>): Array<{ key: string; value: number }> {
  return Array.from(map.entries())
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
}

type SnapshotInput = {
  conversations: ConversationRow[];
  messages: MessageRow[];
  events: EventRow[];
  subscriptionEvents: SubscriptionEventRow[];
  leads: LeadRow[];
  postcardOrders?: PostcardOrderRow[];
  subscriberStats?: SubscriberStats;
  period: { from: string; to: string };
  filters: AnalyticsFilters;
};

/**
 * Pure aggregation used by the admin dashboard and by tests. It never sends a
 * transcript to the browser unless the owner explicitly opens one conversation.
 */
export function buildPierrotSnapshot(input: SnapshotInput): PierrotSnapshot {
  const {
    conversations,
    messages,
    events,
    subscriptionEvents,
    leads,
    postcardOrders = [],
    subscriberStats = { total: 0, confirmed: 0, pending: 0, unsubscribed: 0 },
    period,
    filters,
  } = input;

  const messagesByConversation = new Map<string, MessageRow[]>();
  const eventsByConversation = new Map<string, EventRow[]>();

  for (const message of messages) {
    const list = messagesByConversation.get(message.conversation_id) || [];
    list.push(message);
    messagesByConversation.set(message.conversation_id, list);
  }

  for (const event of events) {
    const list = eventsByConversation.get(event.conversation_id) || [];
    list.push(event);
    eventsByConversation.set(event.conversation_id, list);
  }

  const leadByConversation = new Map(leads.map((lead) => [lead.conversation_id, lead]));

  const summaries: ConversationSummary[] = conversations.map((conversation) => {
    const conversationEvents = (eventsByConversation.get(conversation.id) || []).sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    const conversationMessages = (messagesByConversation.get(conversation.id) || []).sort(
      (a, b) => a.message_index - b.message_index
    );
    const products = new Set<string>();
    const ctaShown = new Set<string>();
    const offersViewed = new Set<string>();
    const ctaClicked = new Set<string>();
    const topics = new Set<string>();
    const outcomes = new Set<ConversationOutcome>();
    let latestIntent: string | null = null;
    let hasError = false;
    let hasReply = conversationMessages.some((message) => message.role === 'assistant');

    for (const event of conversationEvents) {
      const offerId = payloadString(event.payload, 'offer_id');
      const intentName = payloadString(event.payload, 'intent');
      const topic = payloadString(event.payload, 'topic');

      if (offerId) products.add(offerId);
      if (event.event_name === 'offer_viewed') {
        if (offerId) offersViewed.add(offerId);
      }

      if (event.event_name === 'cta_shown') {
        if (offerId) ctaShown.add(offerId);
      }
      if (
        event.event_name === 'offer_action_clicked' ||
        event.event_name === 'subscribe_cta_clicked'
      ) {
        if (offerId) ctaClicked.add(offerId);
      }
      if (event.event_name === 'intent_classified') {
        latestIntent = intentName || latestIntent;
        if (topic) topics.add(topic);
      }
      if (event.event_name === 'assistant_replied') hasReply = true;
      if (event.event_name === 'assistant_failed') hasError = true;
      if (
        event.event_name === 'order_paid' ||
        event.event_name === 'unframed_purchase_confirmed' ||
        event.event_name === 'purchase_completed'
      ) {
        outcomes.add('purchase');
      }
      if (
        event.event_name === 'service_inquiry_submitted' ||
        event.event_name === 'service_inquiry_received'
      ) {
        outcomes.add('lead');
      }
      if (event.event_name === 'commercial_declined') topics.add('declined');
    }

    const lead = leadByConversation.get(conversation.id);
    if (lead && lead.status !== 'new') outcomes.add('lead');

    const conversationSubscriptions = subscriptionEvents.filter(
      (event) =>
        event.conversation_id === conversation.id && event.event_name === 'subscription_confirmed'
    );
    if (conversationSubscriptions.length > 0) outcomes.add('subscription');
    if (hasError) outcomes.add('error');
    if (outcomes.size === 0) outcomes.add('none');

    const lastMessage = conversationMessages[conversationMessages.length - 1] || null;

    return {
      id: conversation.id,
      startedAt: conversation.started_at,
      language: conversation.language,
      status: conversation.status,
      startPage: conversation.start_page,
      latestIntent,
      products: Array.from(products),
      outcomes: Array.from(outcomes),
      hasError,
      hasReply,
      lastMessageRole: lastMessage?.role || null,
      ctaShown: Array.from(ctaShown),
      offersViewed: Array.from(offersViewed),
      ctaClicked: Array.from(ctaClicked),
      topics: Array.from(topics),
      href: `/admin/pierrot?conversation=${encodeURIComponent(conversation.id)}`,
    };
  });

  const q = filters.q?.toLowerCase();

  const filtered = summaries.filter((summary) => {
    if (filters.language && summary.language !== filters.language) return false;
    if (filters.intent && summary.latestIntent !== filters.intent) return false;
    if (filters.product) {
      const productMatch =
        filters.product === 'art_engine'
          ? summary.products.includes('art_engine') || summary.products.includes('advising')
          : summary.products.includes(filters.product);
      if (!productMatch) return false;
    }
    if (filters.outcome && !summary.outcomes.includes(filters.outcome as ConversationOutcome)) {
      return false;
    }
    if (filters.error && !summary.hasError) return false;
    if (
      q &&
      !summary.id.toLowerCase().includes(q) &&
      !summary.startPage.toLowerCase().includes(q) &&
      !(summary.latestIntent || '').toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  const visible = filtered.slice(0, filters.limit || 100);
  const filteredIds = new Set(filtered.map((item) => item.id));
  const visibleIds = new Set(visible.map((item) => item.id));
  const filteredEvents = events.filter((event) => filteredIds.has(event.conversation_id));
  const filteredMessages = messages.filter((message) => filteredIds.has(message.conversation_id));

  const intentMap = new Map<string, number>();
  const offerClickMap = new Map<string, number>();
  const offerConversationMap = new Map<string, Set<string>>();
  let errors = 0;

  for (const summary of filtered) {
    // One conversation contributes one intent: its latest classified intent.
    increment(intentMap, summary.latestIntent);
  }

  for (const event of filteredEvents) {
    if (event.event_name === 'assistant_failed') errors += 1;
    if (
      event.event_name === 'offer_action_clicked' ||
      event.event_name === 'subscribe_cta_clicked'
    ) {
      const offerId = payloadString(event.payload, 'offer_id');
      if (offerId) {
        const existing = offerConversationMap.get(offerId) || new Set<string>();
        existing.add(event.conversation_id);
        offerConversationMap.set(offerId, existing);
      }
    }
  }

  for (const [offerId, ids] of offerConversationMap) offerClickMap.set(offerId, ids.size);

  const visibleSubscriptionEvents = subscriptionEvents.filter(
    (event) => !event.conversation_id || filteredIds.has(event.conversation_id)
  );
  const visibleLeads = leads.filter((lead) => filteredIds.has(lead.conversation_id));

  const confirmedSubscriptions =
    !filters.product || filters.product === 'journal_flow'
      ? countUnique(
          visibleSubscriptionEvents
            .filter((event) => event.event_name === 'subscription_confirmed')
            .map((event) => event.event_key)
        )
      : 0;
  const confirmedPostcardOrders = postcardOrders.filter((order) =>
    ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status)
  ).length;
  const confirmedUnframedPurchases = countUnique(
    filteredEvents
      .filter(
        (event) =>
          event.event_name === 'unframed_purchase_confirmed' ||
          (event.event_name === 'purchase_completed' &&
            payloadString(event.payload, 'offer_id') === 'unframed')
      )
      .map(
        (event) =>
          payloadString(event.payload, 'provider_session_id') ??
          payloadString(event.payload, 'order_id') ??
          event.event_key
      )
  );
  const confirmedPurchases =
    (!filters.product || filters.product === 'heart_angel_postcard' ? confirmedPostcardOrders : 0) +
    (!filters.product || filters.product === 'unframed' ? confirmedUnframedPurchases : 0);
  const qualifiedLeads =
    !filters.product || filters.product === 'art_engine' || filters.product === 'advising'
      ? visibleLeads.filter((lead) => lead.status !== 'new').length
      : 0;
  const unresolved = filtered.filter(
    (summary) =>
      summary.hasError || summary.latestIntent === 'unknown' || summary.latestIntent === 'uncertain'
  ).length;

  const conversationIdsForEvent = (predicate: (event: EventRow) => boolean) =>
    new Set(filteredEvents.filter(predicate).map((event) => event.conversation_id));

  const countForOffer = (eventName: string, offerId: string) =>
    conversationIdsForEvent(
      (event) =>
        event.event_name === eventName && payloadString(event.payload, 'offer_id') === offerId
    ).size;

  const countEvent = (eventName: string, offerId?: string) =>
    conversationIdsForEvent(
      (event) =>
        event.event_name === eventName &&
        (!offerId || payloadString(event.payload, 'offer_id') === offerId)
    ).size;

  const subscriptionSubmitted =
    !filters.product || filters.product === 'journal_flow'
      ? new Set(
          visibleSubscriptionEvents
            .filter((event) => event.event_name === 'subscription_submitted')
            .map((event) => event.event_key)
        ).size
      : 0;
  const subscriptionConfirmed = confirmedSubscriptions;

  const offerStages = (offerId: string): PierrotSnapshot['funnels']['postcard'] => [
    {
      key: 'interest_detected',
      label: 'Interest detected',
      value: countForOffer('interest_detected', offerId),
    },
    {
      key: 'offer_eligible',
      label: 'Offer eligible',
      value: countForOffer('offer_eligible', offerId),
    },
    {
      key: 'offer_selected',
      label: 'Offer selected',
      value: countForOffer('offer_selected', offerId),
    },
    {
      key: 'offer_shown',
      label: 'Offer shown',
      value: countForOffer('offer_shown', offerId),
    },
    {
      key: 'offer_viewed',
      label: 'Offer viewed',
      value: countForOffer('offer_viewed', offerId),
    },
    {
      key: 'cta_shown',
      label: 'CTA shown',
      value: countForOffer('cta_shown', offerId),
    },
    {
      key: 'clicked',
      label: 'CTA clicked',
      value: countForOffer('offer_action_clicked', offerId),
    },
  ];

  const funnels: PierrotSnapshot['funnels'] = {
    postcard: [
      ...offerStages('heart_angel_postcard'),
      {
        key: 'checkout_started',
        label: 'Checkout started',
        value: countForOffer('checkout_started', 'heart_angel_postcard'),
        note: 'Stripe Checkout session created; not a confirmed payment.',
      },
      {
        key: 'confirmed',
        label: 'Confirmed purchase',
        value:
          !filters.product || filters.product === 'heart_angel_postcard'
            ? confirmedPostcardOrders
            : 0,
        note: 'Orders marked PAID or later by the trusted Stripe webhook.',
      },
    ],
    journal: [
      ...offerStages('journal_flow').filter((stage) => stage.key !== 'clicked'),
      {
        key: 'clicked',
        label: 'Subscribe CTA clicked',
        value: countEvent('subscribe_cta_clicked'),
      },
      { key: 'submitted', label: 'Form submitted', value: subscriptionSubmitted },
      { key: 'confirmed', label: 'Confirmed subscription', value: subscriptionConfirmed },
    ],
    art_engine: [
      ...offerStages('art_engine').filter((stage) => stage.key !== 'clicked'),
      {
        key: 'access_clicked',
        label: 'Access CTA clicked',
        value: countForOffer('offer_action_clicked', 'art_engine'),
      },
      {
        key: 'service_started',
        label: 'Service inquiry started',
        value: countEvent('service_inquiry_started'),
      },
      {
        key: 'service_qualified',
        label: 'Service inquiry qualified',
        value: countEvent('service_inquiry_qualified'),
      },
      {
        key: 'service_submitted',
        label: 'Contact submitted',
        value: countEvent('service_inquiry_submitted'),
      },
    ],
    unframed: [
      ...offerStages('unframed'),
      {
        key: 'checkout_started',
        label: 'Checkout started',
        value: countForOffer('checkout_started', 'unframed'),
        note: 'Stripe Checkout session created; not a confirmed purchase.',
      },
      {
        key: 'request_submitted',
        label: 'Proposal request sent',
        value: countEvent('unframed_request_submitted'),
      },
      {
        key: 'confirmed',
        label: 'Confirmed manuscript purchase',
        value: !filters.product || filters.product === 'unframed' ? confirmedUnframedPurchases : 0,
        note: 'Only attributed Stripe confirmations; retailer purchases are not observable here.',
      },
    ],
  };

  const questionGroups = new Map<
    string,
    { count: number; conversations: Set<string>; original: string }
  >();

  for (const message of filteredMessages) {
    if (message.role !== 'user') continue;
    const text = redactPersonalData(message.content).trim();
    if (!text || !isQuestionLike(text)) continue;
    const key = normalizeQuestion(text);
    if (!key) continue;
    const group = questionGroups.get(key) || {
      count: 0,
      conversations: new Set<string>(),
      original: text,
    };
    group.count += 1;
    group.conversations.add(message.conversation_id);
    questionGroups.set(key, group);
  }

  const topQuestions = Array.from(questionGroups.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5);

  const answerFailures = filteredEvents.filter((event) => event.event_name === 'assistant_failed');

  const failedCtaGroups = new Map<string, string[]>();
  for (const summary of filtered) {
    for (const offerId of summary.ctaShown) {
      if (!summary.ctaClicked.includes(offerId)) {
        const list = failedCtaGroups.get(offerId) || [];
        list.push(summary.id);
        failedCtaGroups.set(offerId, list);
      }
    }
  }

  const objectionConversations = visible
    .filter(
      (summary) => summary.topics.includes('price_objection') || summary.topics.includes('declined')
    )
    .map((summary) => summary.id);

  const dropOffGroups = new Map<string, string[]>();
  for (const summary of filtered) {
    if (summary.lastMessageRole !== 'user') continue;
    const key = summary.latestIntent || 'no_intent';
    const list = dropOffGroups.get(key) || [];
    list.push(summary.id);
    dropOffGroups.set(key, list);
  }

  const sampleSize = filtered.length;
  const insights: Insight[] = [];

  for (const [question, group] of topQuestions) {
    if (group.count < 2) continue;
    insights.push({
      id: `question:${question}`,
      kind: 'observed',
      title: `Repeated question: “${question}”`,
      detail: `${group.count} matching user messages across ${group.conversations.size} conversation(s). Top evidence: “${redactPersonalData(
        group.original
      ).slice(0, 220)}”`,
      evidence: evidence(Array.from(group.conversations)),
      period,
      confidence: confidenceFor(sampleSize, group.count),
      sampleSize,
    });
  }

  if (answerFailures.length > 0) {
    const failedConversations = Array.from(
      new Set(answerFailures.map((event) => event.conversation_id))
    );
    insights.push({
      id: 'answer-failures',
      kind: 'observed',
      title: 'Pierrot could not complete an answer',
      detail: `${answerFailures.length} assistant_failed event(s) in ${failedConversations.length} conversation(s).`,
      evidence: evidence(failedConversations),
      period,
      confidence: confidenceFor(sampleSize, answerFailures.length),
      sampleSize,
    });
  }

  const unknownIntentConversations = filtered
    .filter((summary) => summary.latestIntent === 'unknown' || summary.latestIntent === 'uncertain')
    .map((summary) => summary.id);

  if (unknownIntentConversations.length > 0) {
    insights.push({
      id: 'unresolved-intents',
      kind: 'observed',
      title: 'Conversations with no resolved intent',
      detail: `${unknownIntentConversations.length} conversation(s) ended with an unknown or uncertain latest intent.`,
      evidence: evidence(unknownIntentConversations),
      period,
      confidence: confidenceFor(sampleSize, unknownIntentConversations.length),
      sampleSize,
    });
  }

  for (const [offerId, ids] of failedCtaGroups) {
    insights.push({
      id: `cta-no-click:${offerId}`,
      kind: 'observed',
      title: `CTA shown but not clicked: ${offerId}`,
      detail: `${ids.length} conversation(s) saw a ${offerId} CTA without a recorded click.`,
      evidence: evidence(ids),
      period,
      confidence: confidenceFor(sampleSize, ids.length),
      sampleSize,
    });
  }

  if (objectionConversations.length > 0) {
    insights.push({
      id: 'price-objections',
      kind: 'observed',
      title: 'Price or commercial objections were recorded',
      detail: `${objectionConversations.length} conversation(s) contain a price_objection or commercial_declined signal. This does not prove that price caused the visitor to leave.`,
      evidence: evidence(objectionConversations),
      period,
      confidence: confidenceFor(sampleSize, objectionConversations.length),
      sampleSize,
    });
  }

  const topDropOff = Array.from(dropOffGroups.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 3);

  for (const [intent, ids] of topDropOff) {
    insights.push({
      id: `drop-off:${intent}`,
      kind: 'observed',
      title: `Conversation stopped after a user message: ${intent}`,
      detail: `${ids.length} conversation(s) ended with a user message and no later assistant reply.`,
      evidence: evidence(ids),
      period,
      confidence: confidenceFor(sampleSize, ids.length),
      sampleSize,
    });
  }

  const recommendations: Recommendation[] = [];
  const unresolvedRate = sampleSize > 0 ? unresolved / sampleSize : 0;

  if (sampleSize > 0 && (unresolvedRate >= 0.2 || errors > 0)) {
    recommendations.push({
      id: 'improve-unresolved',
      problem: `${unresolved} of ${sampleSize} conversations look unresolved (${Math.round(
        unresolvedRate * 100
      )}%), with ${errors} assistant failure event(s).`,
      evidence: evidence(
        filtered
          .filter(
            (summary) =>
              summary.hasError ||
              summary.latestIntent === 'unknown' ||
              summary.latestIntent === 'uncertain'
          )
          .map((summary) => summary.id)
      ),
      recommendedChange:
        'Clarify the fallback reply and add a short explicit “I do not have a verified answer” path with one next-step option.',
      successCriterion:
        'Unresolved share falls below 15% over the next comparable period without reducing completed answers.',
      period,
      confidence: confidenceFor(sampleSize, unresolved),
      sampleSize,
    });
  }

  const ctaShownTotal = filtered.reduce((sum, summary) => sum + summary.ctaShown.length, 0);
  const ctaClickedTotal = filtered.reduce((sum, summary) => sum + summary.ctaClicked.length, 0);

  if (ctaShownTotal > 0 && ctaClickedTotal / ctaShownTotal < 0.5) {
    recommendations.push({
      id: 'improve-cta',
      problem: `Only ${ctaClickedTotal} recorded clicks for ${ctaShownTotal} shown CTA(s).`,
      evidence: evidence(
        failedCtaGroups.size
          ? Array.from(failedCtaGroups.values()).flat()
          : visible.map((s) => s.id)
      ),
      recommendedChange:
        'Test a clearer CTA label and place the primary action immediately after the direct answer. Keep the same destination and commercial terms.',
      successCriterion:
        'CTA click-through improves over the next comparable period while confirmed outcomes do not fall.',
      period,
      confidence: confidenceFor(sampleSize, ctaShownTotal - ctaClickedTotal),
      sampleSize,
    });
  }

  if (objectionConversations.length >= 3) {
    recommendations.push({
      id: 'clarify-price-objection',
      problem: `${objectionConversations.length} conversations contain a price or commercial objection.`,
      evidence: evidence(objectionConversations),
      recommendedChange:
        'Add one concise value statement and the confirmed price/postage facts next to the offer. Do not assume price caused the exit.',
      successCriterion:
        'Objection signals decrease over the next comparable period while confirmed purchases or qualified leads remain stable.',
      period,
      confidence: confidenceFor(sampleSize, objectionConversations.length),
      sampleSize,
    });
  }

  const topQuestion = topQuestions[0];
  if (topQuestion && topQuestion[1].count >= 3) {
    recommendations.push({
      id: 'add-grounded-answer',
      problem: `The same question appeared ${topQuestion[1].count} times: “${topQuestion[0]}”.`,
      evidence: evidence(Array.from(topQuestion[1].conversations)),
      recommendedChange:
        'Add a verified catalogue fact or a shorter deterministic answer for this question. Do not change prices, routes or commercial terms automatically.',
      successCriterion:
        'The repeated-question count falls over the next comparable period without increasing unresolved conversations.',
      period,
      confidence: confidenceFor(sampleSize, topQuestion[1].count),
      sampleSize,
    });
  }

  const answerFeedback = { up: 0, down: 0 };
  const feedbackByConversation = new Map<string, { up: number; down: number }>();

  for (const event of filteredEvents) {
    if (event.event_name !== 'answer_feedback') continue;
    const rating = payloadString(event.payload, 'rating');
    if (rating !== 'up' && rating !== 'down') continue;

    answerFeedback[rating] += 1;
    const current = feedbackByConversation.get(event.conversation_id) || { up: 0, down: 0 };
    current[rating] += 1;
    feedbackByConversation.set(event.conversation_id, current);
  }

  const retrievalEvents = filteredEvents.filter(
    (event) => event.event_name === 'brain_retrieval'
  );
  let retrievalLatencyTotal = 0;
  let retrievalLatencyCount = 0;
  const retrieval = {
    attempts: retrievalEvents.length,
    relevant: 0,
    noMatch: 0,
    unavailable: 0,
    errors: 0,
    contextUsed: 0,
    media: 0,
    documents: 0,
    chunks: 0,
    averageLatencyMs: null as number | null,
  };

  for (const event of retrievalEvents) {
    const outcome = payloadString(event.payload, 'outcome');
    if (outcome === 'relevant_results') retrieval.relevant += 1;
    if (outcome === 'no_match' || outcome === 'weak_match') retrieval.noMatch += 1;
    if (outcome === 'unavailable' || outcome === 'disabled') retrieval.unavailable += 1;
    if (outcome === 'error') retrieval.errors += 1;
    if (event.payload?.used_context === true) retrieval.contextUsed += 1;
    if (payloadString(event.payload, 'mode') === 'media') retrieval.media += 1;

    retrieval.documents += payloadCount(event.payload, 'document_count', 'document_ids');
    retrieval.chunks += payloadCount(event.payload, 'chunk_count', 'chunk_ids');
    const latency = payloadNumber(event.payload, 'latency_ms');
    if (latency > 0) {
      retrievalLatencyTotal += latency;
      retrievalLatencyCount += 1;
    }
  }

  if (retrievalLatencyCount > 0) {
    retrieval.averageLatencyMs = Math.round(retrievalLatencyTotal / retrievalLatencyCount);
  }

  const handover = {
    requested: countEvent('human_requested'),
    accepted: countEvent('human_accepted'),
    declined: countEvent('human_declined'),
    expired: countEvent('human_expired'),
    messagesSent: countEvent('human_message_sent'),
    messagesReceived: countEvent('human_message_received'),
  };

  const humanRequestedIds = new Set(
    filteredEvents
      .filter((event) => event.event_name === 'human_requested')
      .map((event) => event.conversation_id)
  );
  const humanTerminalIds = new Set(
    filteredEvents
      .filter((event) =>
        ['human_accepted', 'human_declined', 'human_expired', 'human_closed'].includes(
          event.event_name
        )
      )
      .map((event) => event.conversation_id)
  );

  const attention: PierrotAttentionItem[] = [];
  const attentionSeen = new Set<string>();
  const pushAttention = (item: PierrotAttentionItem) => {
    if (attentionSeen.has(item.id)) return;
    attentionSeen.add(item.id);
    attention.push(item);
  };

  for (const summary of visible) {
    if (summary.hasError) {
      pushAttention({
        id: `error:${summary.id}`,
        title: 'Generation failed',
        reason: 'At least one assistant generation failed in this conversation.',
        href: summary.href,
        severity: 'high',
      });
    }

    if (
      summary.latestIntent === 'unknown' ||
      summary.latestIntent === 'uncertain'
    ) {
      pushAttention({
        id: `intent:${summary.id}`,
        title: 'Unresolved intent',
        reason: `Latest intent: ${summary.latestIntent}.`,
        href: summary.href,
        severity: 'medium',
      });
    }

    if (summary.lastMessageRole === 'user' && summary.outcomes.includes('none')) {
      pushAttention({
        id: `no-reply:${summary.id}`,
        title: 'Visitor message without a reply',
        reason: 'The transcript ends with a user message and no recorded outcome.',
        href: summary.href,
        severity: 'medium',
      });
    }

    const feedback = feedbackByConversation.get(summary.id);
    if (feedback && feedback.down > feedback.up) {
      pushAttention({
        id: `feedback:${summary.id}`,
        title: 'Negative answer feedback',
        reason: `${feedback.down} down / ${feedback.up} up.`,
        href: summary.href,
        severity: 'medium',
      });
    }

    if (humanRequestedIds.has(summary.id) && !humanTerminalIds.has(summary.id)) {
      pushAttention({
        id: `human:${summary.id}`,
        title: 'Human request awaits resolution',
        reason: 'A human handover was requested but no terminal status is recorded.',
        href: summary.href,
        severity: 'high',
      });
    }
  }

  const retrievalFailureIds = new Set(
    retrievalEvents
      .filter((event) => {
        const outcome = payloadString(event.payload, 'outcome');
        return outcome === 'no_match' || outcome === 'weak_match' || outcome === 'unavailable';
      })
      .map((event) => event.conversation_id)
  );

  for (const summary of visible) {
    if (retrievalFailureIds.has(summary.id)) {
      pushAttention({
        id: `retrieval:${summary.id}`,
        title: 'Brain retrieval without evidence',
        reason: 'No owner evidence was used; verify that the answer did not overclaim.',
        href: summary.href,
        severity: 'low',
      });
    }
  }

  attention.sort((left, right) => {
    const rank = { high: 0, medium: 1, low: 2 };
    return rank[left.severity] - rank[right.severity] || left.title.localeCompare(right.title);
  });

  const availableIntents = Array.from(
    new Set(events.map((event) => payloadString(event.payload, 'intent')).filter(Boolean))
  ).sort() as string[];
  const availableProducts = Array.from(
    new Set(events.map((event) => payloadString(event.payload, 'offer_id')).filter(Boolean))
  ).sort() as string[];

  return {
    period,
    filters,
    overview: {
      conversationsStarted: filtered.length,
      conversationsWithReplies: filtered.filter((summary) => summary.hasReply).length,
      intents: toSorted(intentMap),
      offerTransitions: toSorted(offerClickMap),
      confirmedSubscriptions,
      confirmedPurchases,
      qualifiedLeads,
      errors,
      unresolved,
      answers: {
        replied: countEvent('assistant_replied'),
        failed: countEvent('assistant_failed'),
      },
      feedback: answerFeedback,
      retrieval,
      handover,
      subscribers: subscriberStats,
    },
    volume: {
      conversations: filtered.length,
      messages: filteredMessages.length,
      events: filteredEvents.length,
      subscriptionEvents: visibleSubscriptionEvents.length,
      leads: visibleLeads.length,
      sampleSufficient: filtered.length >= 20,
    },
    funnels,
    conversations: visible,
    attention,
    insights,
    recommendations,
    availableIntents,
    availableProducts,
  };
}

async function fetchAll<T>(
  store: SupabaseClient,
  table: string,
  select: string,
  configure: (query: any) => any,
  maxRows = 50000
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let from = 0; from < maxRows; from += pageSize) {
    const query = configure(store.from(table).select(select)).range(from, from + pageSize - 1);
    const { data, error } = await query;

    if (error) throw new Error(`${table}: ${error.message}`);
    if (!Array.isArray(data) || data.length === 0) break;

    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
  }

  return rows;
}

export async function loadPierrotDashboard(filters: AnalyticsFilters): Promise<PierrotSnapshot> {
  const store = getServerSupabaseClient({ useServiceRole: true });

  const [conversations, messages, events, subscriptionEvents, leads, postcardOrders] =
    await Promise.all([
      fetchAll<ConversationRow>(
        store,
        'pierrot_conversations',
        'id, session_id, status, language, start_page, started_at, updated_at, ended_at',
        (q) =>
          q
            .gte('started_at', filters.from)
            .lte('started_at', filters.to)
            .order('started_at', { ascending: false })
      ),
      fetchAll<MessageRow>(
        store,
        'pierrot_messages',
        'id, conversation_id, role, content, message_index, provider, created_at',
        (q) =>
          q
            .gte('created_at', filters.from)
            .lte('created_at', filters.to)
            .order('created_at', { ascending: true })
      ),
      fetchAll<EventRow>(
        store,
        'pierrot_events',
        'conversation_id, event_name, event_key, payload, created_at',
        (q) =>
          q
            .gte('created_at', filters.from)
            .lte('created_at', filters.to)
            .order('created_at', { ascending: true })
      ),
      fetchAll<SubscriptionEventRow>(
        store,
        'subscription_events',
        'event_name, event_key, subscriber_id, conversation_id, payload, created_at',
        (q) =>
          q
            .gte('created_at', filters.from)
            .lte('created_at', filters.to)
            .order('created_at', { ascending: true })
      ),
      fetchAll<LeadRow>(
        store,
        'art_service_leads',
        'id, conversation_id, status, need_type, stage, timeline, summary, created_at, submitted_at',
        (q) =>
          q
            .gte('created_at', filters.from)
            .lte('created_at', filters.to)
            .order('created_at', { ascending: true })
      ),
      fetchAll<PostcardOrderRow>(
        store,
        'postcard_orders',
        'id, status, amount, createdAt, updatedAt',
        (q) =>
          q
            .gte('createdAt', filters.from)
            .lte('createdAt', filters.to)
            .order('createdAt', { ascending: false })
      ),
    ]);

  let subscriberStats: SubscriberStats = {
    total: 0,
    confirmed: 0,
    pending: 0,
    unsubscribed: 0,
  };

  try {
    const subscribers = await fetchAll<{
      isActive: boolean;
      confirmedAt: string | null;
      unsubscribedAt: string | null;
    }>(
      store,
      'subscribers',
      'isActive,confirmedAt,unsubscribedAt',
      (q) => q.order('created_at', { ascending: false }),
      5000
    );

    subscriberStats = {
      total: subscribers.length,
      confirmed: subscribers.filter(
        (row) => row.isActive === true && Boolean(row.confirmedAt)
      ).length,
      pending: subscribers.filter(
        (row) => row.isActive === false && !row.unsubscribedAt
      ).length,
      unsubscribed: subscribers.filter((row) => Boolean(row.unsubscribedAt)).length,
    };
  } catch {
    // The subscription table may be temporarily unavailable; the rest of the
    // dashboard remains useful and the metric stays at zero.
  }

  return buildPierrotSnapshot({
    conversations,
    messages,
    events,
    subscriptionEvents,
    leads,
    postcardOrders,
    subscriberStats,
    period: { from: filters.from, to: filters.to },
    filters,
  });
}

export type ConversationTranscript = {
  conversation: ConversationRow;
  messages: MessageRow[];
  events: EventRow[];
  subscriptionEvents: SubscriptionEventRow[];
  lead: LeadRow | null;
};

export async function loadConversationTranscript(
  conversationId: string
): Promise<ConversationTranscript | null> {
  const store = getServerSupabaseClient({ useServiceRole: true });

  const { data: conversation, error } = await store
    .from('pierrot_conversations')
    .select('id, status, language, start_page, started_at, updated_at, ended_at')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) throw error;
  if (!conversation) return null;

  const [messages, events, subscriptionEvents, lead] = await Promise.all([
    fetchAll<MessageRow>(
      store,
      'pierrot_messages',
      'id, conversation_id, role, content, message_index, provider, created_at',
      (q) => q.eq('conversation_id', conversationId).order('message_index', { ascending: true })
    ),
    fetchAll<EventRow>(
      store,
      'pierrot_events',
      'conversation_id, event_name, event_key, payload, created_at',
      (q) => q.eq('conversation_id', conversationId).order('created_at', { ascending: true })
    ),
    fetchAll<SubscriptionEventRow>(
      store,
      'subscription_events',
      'event_name, event_key, subscriber_id, conversation_id, payload, created_at',
      (q) => q.eq('conversation_id', conversationId).order('created_at', { ascending: true })
    ),
    store
      .from('art_service_leads')
      .select(
        'id, conversation_id, status, need_type, stage, timeline, summary, created_at, submitted_at'
      )
      .eq('conversation_id', conversationId)
      .maybeSingle(),
  ]);

  if (lead.error) throw lead.error;

  return {
    conversation: conversation as ConversationRow,
    messages,
    events,
    subscriptionEvents,
    lead: (lead.data as LeadRow | null) || null,
  };
}

export function safeAnalyticsPeriodLabel(from: string, to: string): string {
  const format = (value: string) =>
    new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(value));
  return `${format(from)} — ${format(to)}`;
}

export function startOfDayIso(daysAgo = 0): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString();
}

export function endOfDayIso(): string {
  const date = new Date();
  date.setUTCHours(23, 59, 59, 999);
  return date.toISOString();
}
