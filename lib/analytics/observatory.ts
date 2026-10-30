import type { SupabaseClient } from '@supabase/supabase-js';

import { getServerSupabaseClient } from '@/lib/serverAuth';

export type ObservatoryPreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export type ObservatoryFilters = {
  preset: ObservatoryPreset;
  from: string;
  to: string;
  compare: boolean;
  language?: string;
};

export type ObservatoryMetric = {
  value: number;
  previous: number | null;
  deltaPercent: number | null;
};

export type ObservatoryOfferMetrics = {
  offerId: string;
  interestedConversations: number;
  eligibleConversations: number;
  shownConversations: number;
  viewedConversations: number;
  ctaConversations: number;
  selectedConversations: number;
  clickedConversations: number;
  checkoutConversations: number;
  purchasedConversations: number;
};

export type ObservatoryEditorialTopic = {
  topic: string;
  occurrences: number;
  routes: string[];
  documentIds: string[];
  missingKnowledge: boolean;
  opportunity: string;
};

export type ObservatoryConversationSummary = {
  id: string;
  startedAt: string;
  language: string;
  route: string;
  status: string;
  latestIntent: string | null;
  products: string[];
  messageCount: number;
  lastMessageRole: string | null;
  retrieval: 'success' | 'failure' | 'none';
};

export type ObservatorySnapshot = {
  period: { from: string; to: string; preset: ObservatoryPreset };
  previousPeriod: { from: string; to: string };
  generatedAt: string;
  overview: {
    conversationsToday: number;
    conversationsThisWeek: number;
    conversationsThisMonth: number;
    totalConversations: ObservatoryMetric;
    totalMessages: ObservatoryMetric;
    averageMessagesPerConversation: ObservatoryMetric;
    activeConversations: number;
    returningSessions: number;
    returningConversations: number;
    totalEvents: ObservatoryMetric;
  };
  interest: {
    topTopics: Array<{ topic: string; conversationCount: number; eventCount: number }>;
    intentDistribution: Array<{ intent: string; conversationCount: number }>;
    destinations: Array<{ sectionId: string; conversationCount: number; eventCount: number }>;
    sourcePages: Array<{ route: string; conversationCount: number }>;
    languages: Array<{ language: string; conversationCount: number }>;
  };
  commercial: {
    offers: ObservatoryOfferMetrics[];
    offersShown: number;
    offersSelected: number;
    checkoutStarts: number;
    confirmedPurchases: number;
    funnelAbandonment: number;
    abandonmentRate: number | null;
    serviceInquiries: number;
    serviceInquiriesQualified: number;
  };
  intelligence: {
    unknownIntents: number;
    uncertainIntents: number;
    retrievalFailures: number;
    retrievalFailureRate: number | null;
    unansweredQuestions: number;
    negativeFeedback: number;
    assistantFailures: number;
    topDocuments: Array<{ documentId: string; retrievalCount: number }>;
    editorialRadar: ObservatoryEditorialTopic[];
    averageResponseLatencyMs: number | null;
  };
  conversations: ObservatoryConversationSummary[];
};

type ConversationRow = {
  id: string;
  session_id: string | null;
  status: string;
  language: string;
  start_page: string;
  started_at: string;
  ended_at: string | null;
  updated_at: string | null;
  last_message_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  message_index: number;
  created_at: string;
};

type EventRow = {
  conversation_id: string;
  event_name: string;
  event_key: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

type SubscriptionEventRow = {
  event_name: string;
  conversation_id: string | null;
  created_at: string;
};

type LeadRow = {
  id: string;
  conversation_id: string;
  status: string;
  need_type: string | null;
  created_at: string;
};

type PostcardOrderRow = {
  id: string;
  status: string;
  amount: number | null;
  createdAt: string;
};

type PeriodData = {
  conversations: ConversationRow[];
  messages: MessageRow[];
  events: EventRow[];
  subscriptionEvents: SubscriptionEventRow[];
  leads: LeadRow[];
  postcardOrders: PostcardOrderRow[];
};

const OFFER_IDS = [
  'heart_angel_postcard',
  'unframed',
  'journal_flow',
  'art_engine',
  'advising',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const start = startOfUtcDay(date);
  start.setUTCDate(start.getUTCDate() - offset);
  return start;
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function parseDate(value: string | undefined, endOfDay: boolean): Date | null {
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`)
    : new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseObservatoryFilters(
  search: Record<string, string | string[] | undefined> = {}
): ObservatoryFilters {
  const raw = (key: string) => {
    const value = search[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const presetRaw = raw('preset');
  const preset: ObservatoryPreset =
    presetRaw === 'today' ||
    presetRaw === '7d' ||
    presetRaw === '30d' ||
    presetRaw === '90d' ||
    presetRaw === 'custom'
      ? presetRaw
      : '30d';
  const now = new Date();
  let from = startOfUtcDay(new Date(now.getTime() - 29 * DAY_MS));
  let to = now;

  if (preset === 'today') from = startOfUtcDay(now);
  if (preset === '7d') from = startOfUtcDay(new Date(now.getTime() - 6 * DAY_MS));
  if (preset === '90d') from = startOfUtcDay(new Date(now.getTime() - 89 * DAY_MS));
  if (preset === 'custom') {
    const customFrom = parseDate(raw('from'), false);
    const customTo = parseDate(raw('to'), true);
    if (customFrom && customTo && customFrom <= customTo) {
      from = customFrom;
      to = customTo;
    }
  }

  return {
    preset,
    from: from.toISOString(),
    to: to.toISOString(),
    compare: raw('compare') !== '0',
    language: ['ru', 'en', 'und'].includes(String(raw('language')))
      ? String(raw('language'))
      : undefined,
  };
}

function previousPeriod(from: string, to: string): { from: string; to: string } {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  const duration = Math.max(1, end - start + 1);

  return {
    from: new Date(start - duration).toISOString(),
    to: new Date(start - 1).toISOString(),
  };
}

async function fetchAll<T>(
  store: SupabaseClient,
  table: string,
  select: string,
  configure: (query: any) => any,
  maxRows = 50_000
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

async function loadPeriodData(
  store: SupabaseClient,
  from: string,
  to: string,
  language?: string
): Promise<PeriodData> {
  const conversationsQuery = (query: any) => {
    let next = query
      .gte('started_at', from)
      .lte('started_at', to)
      .order('started_at', { ascending: false });
    if (language) next = next.eq('language', language);
    return next;
  };

  const [conversations, messages, events, subscriptionEvents, leads, postcardOrders] =
    await Promise.all([
      fetchAll<ConversationRow>(
        store,
        'pierrot_conversations',
        'id, session_id, status, language, start_page, started_at, ended_at, updated_at, last_message_at',
        conversationsQuery
      ),
      fetchAll<MessageRow>(
        store,
        'pierrot_messages',
        'id, conversation_id, role, content, message_index, created_at',
        (query) =>
          query
            .gte('created_at', from)
            .lte('created_at', to)
            .order('created_at', { ascending: true })
      ),
      fetchAll<EventRow>(
        store,
        'pierrot_events',
        'conversation_id, event_name, event_key, payload, created_at',
        (query) =>
          query
            .gte('created_at', from)
            .lte('created_at', to)
            .order('created_at', { ascending: true })
      ),
      fetchAll<SubscriptionEventRow>(
        store,
        'subscription_events',
        'event_name, conversation_id, created_at',
        (query) =>
          query
            .gte('created_at', from)
            .lte('created_at', to)
            .order('created_at', { ascending: true })
      ),
      fetchAll<LeadRow>(
        store,
        'art_service_leads',
        'id, conversation_id, status, need_type, created_at',
        (query) =>
          query
            .gte('created_at', from)
            .lte('created_at', to)
            .order('created_at', { ascending: true })
      ),
      fetchAll<PostcardOrderRow>(
        store,
        'postcard_orders',
        'id, status, amount, createdAt',
        (query) =>
          query.gte('createdAt', from).lte('createdAt', to).order('createdAt', { ascending: false })
      ),
    ]);

  return {
    conversations,
    messages,
    events,
    subscriptionEvents,
    leads,
    postcardOrders,
  };
}

function payloadString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
}

function offerId(payload: Record<string, unknown> | null): string | null {
  return payloadString(payload, 'product_id') ?? payloadString(payload, 'offer_id');
}

function eventConversationMap(
  events: EventRow[],
  predicate: (event: EventRow) => boolean
): Map<string, number> {
  const map = new Map<string, number>();

  for (const event of events) {
    if (!predicate(event)) continue;
    map.set(event.conversation_id, (map.get(event.conversation_id) ?? 0) + 1);
  }

  return map;
}

function uniqueConversations(events: EventRow[], predicate: (event: EventRow) => boolean): number {
  return eventConversationMap(events, predicate).size;
}

function purchaseKeys(data: PeriodData): Set<string> {
  const keys = new Set<string>();
  const confirmed = data.events.filter((event) => event.event_name === 'purchase_completed');

  for (const event of confirmed) {
    keys.add(
      `completed:${payloadString(event.payload, 'order_id') ?? ''}:${payloadString(event.payload, 'provider_session_id') ?? ''}:${event.event_key}`
    );
  }

  for (const event of data.events.filter((event) => event.event_name === 'order_paid')) {
    const orderId = payloadString(event.payload, 'order_id');
    if (
      !orderId ||
      !confirmed.some(
        (entry) =>
          payloadString(entry.payload, 'order_id') === orderId &&
          entry.conversation_id === event.conversation_id
      )
    ) {
      keys.add(`order:${orderId ?? event.event_key}`);
    }
  }

  for (const event of data.events.filter(
    (event) => event.event_name === 'unframed_purchase_confirmed'
  )) {
    const session = event.event_key.split(':')[1] ?? event.event_key;
    if (
      !confirmed.some(
        (entry) =>
          payloadString(entry.payload, 'provider_session_id') === session &&
          entry.conversation_id === event.conversation_id
      )
    ) {
      keys.add(`session:${session}`);
    }
  }

  for (const order of data.postcardOrders) {
    if (['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
      keys.add(`order:${order.id}`);
    }
  }

  return keys;
}

function offerMetrics(data: PeriodData): ObservatoryOfferMetrics[] {
  return OFFER_IDS.map((id) => {
    const forOffer = (event: EventRow) => offerId(event.payload) === id;
    const eventNames = (names: string[]) => (event: EventRow) =>
      names.includes(event.event_name) && forOffer(event);

    return {
      offerId: id,
      interestedConversations: uniqueConversations(
        data.events,
        eventNames(['interest_detected', 'offer_selected', 'offer_viewed', 'cta_shown'])
      ),
      eligibleConversations: uniqueConversations(data.events, eventNames(['offer_eligible'])),
      shownConversations: uniqueConversations(
        data.events,
        eventNames(['offer_shown', 'offer_viewed', 'cta_shown'])
      ),
      viewedConversations: uniqueConversations(data.events, eventNames(['offer_viewed'])),
      ctaConversations: uniqueConversations(data.events, eventNames(['cta_shown'])),
      selectedConversations: uniqueConversations(data.events, eventNames(['offer_selected'])),
      clickedConversations: uniqueConversations(
        data.events,
        eventNames(['offer_action_clicked', 'subscribe_cta_clicked'])
      ),
      checkoutConversations: uniqueConversations(data.events, eventNames(['checkout_started'])),
      purchasedConversations: uniqueConversations(
        data.events,
        eventNames(['purchase_completed', 'order_paid', 'unframed_purchase_confirmed'])
      ),
    };
  });
}

function topCounts<T extends string>(values: T[], limit = 8): Array<{ key: T; count: number }> {
  const map = new Map<T, number>();

  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);

  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
}

function normalizeQuestion(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(
      (word) =>
        word.length >= 4 &&
        ![
          'what',
          'when',
          'where',
          'which',
          'why',
          'how',
          'does',
          'this',
          'that',
          'with',
          'have',
          'your',
          'about',
          'from',
          'into',
          'there',
          'their',
          'would',
          'could',
          'should',
          'какой',
          'какая',
          'какие',
          'почему',
          'когда',
          'где',
          'что',
          'это',
          'как',
          'про',
          'для',
          'или',
          'мне',
          'меня',
          'мои',
          'моих',
          'есть',
          'быть',
        ].includes(word)
    );
}

function clusterEditorial(
  questions: Array<{
    question: string;
    conversationId: string;
    route: string;
    documentIds: string[];
  }>
): ObservatoryEditorialTopic[] {
  const clusters: Array<{
    tokens: Set<string>;
    questions: typeof questions;
  }> = [];

  for (const question of questions) {
    const tokens = new Set(normalizeQuestion(question.question));
    if (tokens.size === 0) continue;

    let best: (typeof clusters)[number] | null = null;
    let bestScore = 0;

    for (const cluster of clusters) {
      const intersection = [...tokens].filter((token) => cluster.tokens.has(token)).length;
      const union = new Set([...tokens, ...cluster.tokens]).size;
      const score = union > 0 ? intersection / union : 0;

      if (score > bestScore) {
        bestScore = score;
        best = cluster;
      }
    }

    if (best && bestScore >= 0.34) {
      for (const token of tokens) best.tokens.add(token);
      best.questions.push(question);
    } else {
      clusters.push({ tokens, questions: [question] });
    }
  }

  return clusters
    .map((cluster) => {
      const tokenCounts = new Map<string, number>();

      for (const question of cluster.questions) {
        for (const token of normalizeQuestion(question.question)) {
          tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
        }
      }

      const label =
        Array.from(tokenCounts.entries())
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 3)
          .map(([token]) => token)
          .join(' ') || 'General enquiry';

      return {
        topic: label,
        occurrences: cluster.questions.length,
        routes: Array.from(new Set(cluster.questions.map((question) => question.route))).slice(
          0,
          5
        ),
        documentIds: Array.from(
          new Set(cluster.questions.flatMap((question) => question.documentIds))
        ).slice(0, 10),
        missingKnowledge: true,
        opportunity: `Write or ingest a focused source about “${label}” and link it from the affected route(s).`,
      };
    })
    .sort(
      (left, right) => right.occurrences - left.occurrences || left.topic.localeCompare(right.topic)
    )
    .slice(0, 8);
}

function metric(current: number, previous: number): ObservatoryMetric {
  return {
    value: current,
    previous,
    deltaPercent:
      previous > 0 ? Number((((current - previous) / previous) * 100).toFixed(1)) : null,
  };
}

type AggregateResult = Pick<
  ObservatorySnapshot,
  'interest' | 'commercial' | 'intelligence' | 'conversations'
> & {
  returningSessions: number;
  returningConversations: number;
};

function aggregate(data: PeriodData): AggregateResult {
  const messageByConversation = new Map<string, MessageRow[]>();
  const eventsByConversation = new Map<string, EventRow[]>();
  const docsByConversation = new Map<string, Set<string>>();
  const feedbackByConversation = new Map<string, number>();
  const latestIntentByConversation = new Map<string, string>();
  const productByConversation = new Map<string, Set<string>>();

  for (const message of data.messages) {
    const list = messageByConversation.get(message.conversation_id) ?? [];
    list.push(message);
    messageByConversation.set(message.conversation_id, list);
  }

  for (const event of data.events) {
    const list = eventsByConversation.get(event.conversation_id) ?? [];
    list.push(event);
    eventsByConversation.set(event.conversation_id, list);

    if (event.event_name === 'brain_retrieval') {
      const ids = new Set<string>();
      const payloadDocs = event.payload?.document_ids;
      if (Array.isArray(payloadDocs)) {
        for (const id of payloadDocs) if (typeof id === 'string') ids.add(id);
      }
      const docs = docsByConversation.get(event.conversation_id) ?? new Set<string>();
      for (const id of ids) docs.add(id);
      docsByConversation.set(event.conversation_id, docs);
    }

    if (
      event.event_name === 'answer_feedback' &&
      payloadString(event.payload, 'rating') === 'down'
    ) {
      feedbackByConversation.set(
        event.conversation_id,
        (feedbackByConversation.get(event.conversation_id) ?? 0) + 1
      );
    }

    if (event.event_name === 'intent_classified') {
      const intent = payloadString(event.payload, 'intent');
      if (intent) latestIntentByConversation.set(event.conversation_id, intent);
    }

    const id = offerId(event.payload);
    if (id) {
      const products = productByConversation.get(event.conversation_id) ?? new Set<string>();
      products.add(id);
      productByConversation.set(event.conversation_id, products);
    }
  }

  const sessionCounts = new Map<string, number>();
  for (const conversation of data.conversations) {
    if (!conversation.session_id) continue;
    sessionCounts.set(
      conversation.session_id,
      (sessionCounts.get(conversation.session_id) ?? 0) + 1
    );
  }

  const returningSessions = Array.from(sessionCounts.values()).filter((count) => count > 1).length;
  const returningConversations = Array.from(sessionCounts.values())
    .filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);

  const topics = new Map<string, { conversations: Set<string>; events: number }>();
  const intents = new Map<string, Set<string>>();
  const destinations = new Map<string, { conversations: Set<string>; events: number }>();

  for (const event of data.events) {
    if (event.event_name === 'intent_classified') {
      const intent = payloadString(event.payload, 'intent');
      const topic = payloadString(event.payload, 'topic');
      if (intent) {
        const set = intents.get(intent) ?? new Set<string>();
        set.add(event.conversation_id);
        intents.set(intent, set);
      }
      if (topic) {
        const entry = topics.get(topic) ?? { conversations: new Set<string>(), events: 0 };
        entry.conversations.add(event.conversation_id);
        entry.events += 1;
        topics.set(topic, entry);
      }
    }

    if (event.event_name === 'navigation_completed' || event.event_name === 'action_clicked') {
      const section = payloadString(event.payload, 'section_id');
      if (section) {
        const entry = destinations.get(section) ?? { conversations: new Set<string>(), events: 0 };
        entry.conversations.add(event.conversation_id);
        entry.events += 1;
        destinations.set(section, entry);
      }
    }
  }

  const sourcePages = topCounts(data.conversations.map((conversation) => conversation.start_page));
  const languages = topCounts(data.conversations.map((conversation) => conversation.language));

  const offers = offerMetrics(data);
  const offersShown = uniqueConversations(data.events, (event) =>
    ['offer_shown', 'offer_viewed', 'cta_shown'].includes(event.event_name)
  );
  const offersSelected = uniqueConversations(
    data.events,
    (event) => event.event_name === 'offer_selected'
  );
  const checkoutStarts = uniqueConversations(
    data.events,
    (event) => event.event_name === 'checkout_started'
  );
  const purchases = purchaseKeys(data);
  const purchasedConversations = new Set(
    data.events
      .filter((event) =>
        ['purchase_completed', 'order_paid', 'unframed_purchase_confirmed'].includes(
          event.event_name
        )
      )
      .map((event) => event.conversation_id)
  );
  const funnelAbandonment = Math.max(0, checkoutStarts - purchasedConversations.size);

  const retrievalEvents = data.events.filter((event) => event.event_name === 'brain_retrieval');
  const retrievalFailures = retrievalEvents.filter((event) => {
    const outcome = payloadString(event.payload, 'outcome');
    return outcome !== 'relevant_results' || Boolean(payloadString(event.payload, 'code'));
  }).length;

  const documentCounts = new Map<string, number>();
  for (const docs of docsByConversation.values()) {
    for (const doc of docs) documentCounts.set(doc, (documentCounts.get(doc) ?? 0) + 1);
  }

  const unanswered: Array<{
    question: string;
    conversationId: string;
    route: string;
    documentIds: string[];
  }> = [];

  for (const conversation of data.conversations) {
    const messages = (messageByConversation.get(conversation.id) ?? []).sort(
      (left, right) => left.message_index - right.message_index
    );

    messages.forEach((message, index) => {
      if (message.role !== 'user') return;
      const next = messages[index + 1];
      const unansweredQuestion = !next || next.role === 'user';

      if (unansweredQuestion || (feedbackByConversation.get(conversation.id) ?? 0) > 0) {
        unanswered.push({
          question: message.content,
          conversationId: conversation.id,
          route: conversation.start_page,
          documentIds: Array.from(docsByConversation.get(conversation.id) ?? []),
        });
      }
    });
  }

  const latencies = data.events
    .filter((event) => event.event_name === 'assistant_replied')
    .map((event) => event.payload?.latency_ms)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  const summaries: ObservatoryConversationSummary[] = data.conversations.map((conversation) => {
    const messages = messageByConversation.get(conversation.id) ?? [];
    const conversationEvents = eventsByConversation.get(conversation.id) ?? [];
    const hasRetrieval = conversationEvents.some((event) => event.event_name === 'brain_retrieval');
    const retrievalFailed = conversationEvents.some(
      (event) =>
        event.event_name === 'brain_retrieval' &&
        (payloadString(event.payload, 'outcome') !== 'relevant_results' ||
          Boolean(payloadString(event.payload, 'code')))
    );

    return {
      id: conversation.id,
      startedAt: conversation.started_at,
      language: conversation.language,
      route: conversation.start_page,
      status: conversation.status,
      latestIntent: latestIntentByConversation.get(conversation.id) ?? null,
      products: Array.from(productByConversation.get(conversation.id) ?? []),
      messageCount: messages.length,
      lastMessageRole: messages.length > 0 ? messages[messages.length - 1].role : null,
      retrieval: hasRetrieval ? (retrievalFailed ? 'failure' : 'success') : 'none',
    };
  });

  const unknownIntents = data.events.filter(
    (event) =>
      event.event_name === 'intent_classified' &&
      ['unknown', 'uncertain'].includes(payloadString(event.payload, 'intent') ?? '')
  ).length;
  const uncertainIntents = data.events.filter(
    (event) => event.event_name === 'intent_classified' && event.payload?.uncertain === true
  ).length;

  return {
    interest: {
      topTopics: Array.from(topics.entries())
        .map(([topic, entry]) => ({
          topic,
          conversationCount: entry.conversations.size,
          eventCount: entry.events,
        }))
        .sort(
          (left, right) =>
            right.eventCount - left.eventCount || left.topic.localeCompare(right.topic)
        )
        .slice(0, 8),
      intentDistribution: Array.from(intents.entries())
        .map(([intent, conversations]) => ({
          intent,
          conversationCount: conversations.size,
        }))
        .sort((left, right) => right.conversationCount - left.conversationCount),
      destinations: Array.from(destinations.entries())
        .map(([sectionId, entry]) => ({
          sectionId,
          conversationCount: entry.conversations.size,
          eventCount: entry.events,
        }))
        .sort((left, right) => right.eventCount - left.eventCount)
        .slice(0, 8),
      sourcePages: sourcePages.map((entry) => ({
        route: entry.key,
        conversationCount: entry.count,
      })),
      languages: languages.map((entry) => ({
        language: entry.key,
        conversationCount: entry.count,
      })),
    },
    commercial: {
      offers,
      offersShown,
      offersSelected,
      checkoutStarts,
      confirmedPurchases: purchases.size,
      funnelAbandonment,
      abandonmentRate:
        checkoutStarts > 0 ? Number(((funnelAbandonment / checkoutStarts) * 100).toFixed(1)) : null,
      serviceInquiries: data.leads.length,
      serviceInquiriesQualified: data.leads.filter((lead) => lead.status !== 'new').length,
    },
    intelligence: {
      unknownIntents,
      uncertainIntents,
      retrievalFailures,
      retrievalFailureRate:
        retrievalEvents.length > 0
          ? Number(((retrievalFailures / retrievalEvents.length) * 100).toFixed(1))
          : null,
      unansweredQuestions: unanswered.length,
      negativeFeedback: Array.from(feedbackByConversation.values()).reduce(
        (sum, count) => sum + count,
        0
      ),
      assistantFailures: data.events.filter((event) => event.event_name === 'assistant_failed')
        .length,
      topDocuments: Array.from(documentCounts.entries())
        .map(([documentId, retrievalCount]) => ({ documentId, retrievalCount }))
        .sort((left, right) => right.retrievalCount - left.retrievalCount)
        .slice(0, 10),
      editorialRadar: clusterEditorial(unanswered),
      averageResponseLatencyMs:
        latencies.length > 0
          ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
          : null,
    },
    conversations: summaries.slice(0, 20),
    returningSessions,
    returningConversations,
  };
}

async function countConversationsSince(
  store: SupabaseClient,
  since: Date,
  language?: string
): Promise<number> {
  let query = store
    .from('pierrot_conversations')
    .select('id', { count: 'exact', head: true })
    .gte('started_at', since.toISOString());

  if (language) query = query.eq('language', language);

  const { count, error } = await query;

  if (error) throw error;
  return count ?? 0;
}

export async function loadObservatorySnapshot(
  filters: ObservatoryFilters
): Promise<ObservatorySnapshot> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const previous = previousPeriod(filters.from, filters.to);
  const now = new Date();
  const today = startOfUtcDay(now);
  const week = startOfUtcWeek(now);
  const month = startOfUtcMonth(now);

  const [current, previousData, conversationsToday, conversationsThisWeek, conversationsThisMonth] =
    await Promise.all([
      loadPeriodData(store, filters.from, filters.to, filters.language),
      loadPeriodData(store, previous.from, previous.to, filters.language),
      countConversationsSince(store, today, filters.language),
      countConversationsSince(store, week, filters.language),
      countConversationsSince(store, month, filters.language),
    ]);

  const currentAggregate = aggregate(current);
  const totalMessages = current.messages.length;
  const averageMessages =
    current.conversations.length > 0
      ? Number((totalMessages / current.conversations.length).toFixed(2))
      : 0;
  const previousAverage =
    previousData.conversations.length > 0
      ? Number((previousData.messages.length / previousData.conversations.length).toFixed(2))
      : 0;

  return {
    period: { ...filters, from: filters.from, to: filters.to },
    previousPeriod: previous,
    generatedAt: now.toISOString(),
    overview: {
      conversationsToday,
      conversationsThisWeek,
      conversationsThisMonth,
      totalConversations: metric(current.conversations.length, previousData.conversations.length),
      totalMessages: metric(totalMessages, previousData.messages.length),
      averageMessagesPerConversation: metric(averageMessages, previousAverage),
      activeConversations: current.conversations.filter(
        (conversation) => conversation.status === 'active'
      ).length,
      returningSessions: currentAggregate.returningSessions,
      returningConversations: currentAggregate.returningConversations,
      totalEvents: metric(current.events.length, previousData.events.length),
    },
    ...currentAggregate,
    conversations: currentAggregate.conversations,
  } as ObservatorySnapshot;
}
