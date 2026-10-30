import type { SupabaseClient } from '@supabase/supabase-js';

import { getServerSupabaseClient } from '@/lib/serverAuth';

export const EXPLORER_PAGE_SIZE = 25;

export type DrilldownKind = 'conversations' | 'offers' | 'retrieval' | 'topics';

export type ConversationExplorerFilters = {
  from: string;
  to: string;
  language?: string;
  route?: string;
  intent?: string;
  product?: string;
  status?: string;
  retrieval?: 'success' | 'failure' | 'none';
  q?: string;
  page: number;
};

export type ExplorerConversation = {
  id: string;
  startedAt: string;
  updatedAt: string | null;
  endedAt: string | null;
  status: string;
  language: string;
  route: string;
  messageCount: number;
  lastMessageRole: string | null;
  latestIntent: string | null;
  products: string[];
  retrieval: 'success' | 'failure' | 'none';
};

export type ExplorerResult = {
  rows: ExplorerConversation[];
  total: number;
  page: number;
  pageSize: number;
};

export type OfferEventRow = {
  conversationId: string;
  eventName: string;
  offerId: string | null;
  createdAt: string;
  reason: string | null;
  payload: Record<string, unknown> | null;
};

export type RetrievalFailureRow = {
  conversationId: string;
  createdAt: string;
  outcome: string | null;
  code: string | null;
  query: string | null;
  queryHash: string | null;
  method: string | null;
  candidateCount: number | null;
  topSimilarity: number | null;
  question: string | null;
  documentIds: string[];
  ranking: Array<{ documentId: string; combinedScore: number | null; sourceClass: string | null }>;
};

export type TopicRow = {
  topic: string;
  occurrences: number;
  routes: string[];
  documentIds: string[];
  conversationIds: string[];
  questions: string[];
};

type ConversationRow = {
  id: string;
  status: string;
  language: string;
  start_page: string;
  started_at: string;
  ended_at: string | null;
  updated_at: string | null;
};

type MessageRow = {
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

function payloadString(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
}

function offerId(payload: Record<string, unknown> | null): string | null {
  return payloadString(payload, 'product_id') ?? payloadString(payload, 'offer_id');
}

async function fetchAll<T>(
  store: SupabaseClient,
  table: string,
  select: string,
  configure: (query: any) => any,
  maxRows = 20_000
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

function isFailure(event: EventRow): boolean {
  if (event.event_name !== 'brain_retrieval') return false;
  const outcome = payloadString(event.payload, 'outcome');
  return outcome !== 'relevant_results' || Boolean(payloadString(event.payload, 'code'));
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

async function loadPeriod(
  store: SupabaseClient,
  from: string,
  to: string
): Promise<{ conversations: ConversationRow[]; messages: MessageRow[]; events: EventRow[] }> {
  const [conversations, messages, events] = await Promise.all([
    fetchAll<ConversationRow>(
      store,
      'pierrot_conversations',
      'id, status, language, start_page, started_at, ended_at, updated_at',
      (query) =>
        query
          .gte('started_at', from)
          .lte('started_at', to)
          .order('started_at', { ascending: false })
    ),
    fetchAll<MessageRow>(
      store,
      'pierrot_messages',
      'conversation_id, role, content, message_index, created_at',
      (query) =>
        query.gte('created_at', from).lte('created_at', to).order('created_at', { ascending: true })
    ),
    fetchAll<EventRow>(
      store,
      'pierrot_events',
      'conversation_id, event_name, event_key, payload, created_at',
      (query) =>
        query.gte('created_at', from).lte('created_at', to).order('created_at', { ascending: true })
    ),
  ]);

  return { conversations, messages, events };
}

function buildExplorerRows(
  conversations: ConversationRow[],
  messages: MessageRow[],
  events: EventRow[]
): ExplorerConversation[] {
  const messagesByConversation = new Map<string, MessageRow[]>();
  const eventsByConversation = new Map<string, EventRow[]>();

  for (const message of messages) {
    const list = messagesByConversation.get(message.conversation_id) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversation_id, list);
  }

  for (const event of events) {
    const list = eventsByConversation.get(event.conversation_id) ?? [];
    list.push(event);
    eventsByConversation.set(event.conversation_id, list);
  }

  return conversations.map((conversation) => {
    const conversationMessages = messagesByConversation.get(conversation.id) ?? [];
    const conversationEvents = eventsByConversation.get(conversation.id) ?? [];
    const retrievalEvents = conversationEvents.filter(
      (event) => event.event_name === 'brain_retrieval'
    );
    const latestIntent =
      [...conversationEvents]
        .reverse()
        .map((event) =>
          event.event_name === 'intent_classified' ? payloadString(event.payload, 'intent') : null
        )
        .find((value): value is string => Boolean(value)) ?? null;
    const products = Array.from(
      new Set(
        conversationEvents
          .map((event) => offerId(event.payload))
          .filter((value): value is string => Boolean(value))
      )
    );

    return {
      id: conversation.id,
      startedAt: conversation.started_at,
      updatedAt: conversation.updated_at,
      endedAt: conversation.ended_at,
      status: conversation.status,
      language: conversation.language,
      route: conversation.start_page,
      messageCount: conversationMessages.length,
      lastMessageRole:
        conversationMessages.length > 0
          ? conversationMessages[conversationMessages.length - 1].role
          : null,
      latestIntent,
      products,
      retrieval:
        retrievalEvents.length === 0
          ? 'none'
          : retrievalEvents.some(isFailure)
            ? 'failure'
            : 'success',
    };
  });
}

export async function loadConversationExplorer(
  filters: ConversationExplorerFilters
): Promise<ExplorerResult> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const { conversations, messages, events } = await loadPeriod(store, filters.from, filters.to);
  let rows = buildExplorerRows(conversations, messages, events);

  if (filters.language) {
    const language = filters.language.toLowerCase();
    rows = rows.filter((row) => row.language.toLowerCase() === language);
  }
  if (filters.route) rows = rows.filter((row) => row.route === filters.route);
  if (filters.status) rows = rows.filter((row) => row.status === filters.status);
  if (filters.intent) rows = rows.filter((row) => row.latestIntent === filters.intent);
  if (filters.product) rows = rows.filter((row) => row.products.includes(filters.product!));
  if (filters.retrieval) rows = rows.filter((row) => row.retrieval === filters.retrieval);

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const matchingIds = new Set(
      messages
        .filter((message) => message.content.toLowerCase().includes(needle))
        .map((message) => message.conversation_id)
    );
    rows = rows.filter((row) => matchingIds.has(row.id));
  }

  const total = rows.length;
  const pageSize = EXPLORER_PAGE_SIZE;
  const page = Math.max(1, Math.min(filters.page, Math.max(1, Math.ceil(total / pageSize))));
  const start = (page - 1) * pageSize;

  return {
    rows: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  };
}

export async function loadOfferEvents(
  from: string,
  to: string,
  offerFilter?: string,
  limit = 200
): Promise<OfferEventRow[]> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  let query = store
    .from('pierrot_events')
    .select('conversation_id, event_name, payload, created_at')
    .gte('created_at', from)
    .lte('created_at', to)
    .in('event_name', [
      'interest_detected',
      'offer_eligible',
      'offer_selected',
      'offer_shown',
      'offer_viewed',
      'offer_rejected',
      'cta_shown',
      'offer_action_clicked',
      'checkout_started',
      'purchase_completed',
      'order_paid',
      'unframed_purchase_confirmed',
    ]);

  if (offerFilter && /^[a-z0-9_]+$/i.test(offerFilter)) {
    query = query.or(`payload->>offer_id.eq.${offerFilter},payload->>product_id.eq.${offerFilter}`);
  }

  const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);

  if (error) throw new Error(`pierrot_events: ${error.message}`);

  return (data ?? []).map((event: any) => ({
    conversationId: event.conversation_id,
    eventName: event.event_name,
    offerId: offerId(event.payload),
    createdAt: event.created_at,
    reason:
      payloadString(event.payload, 'recommendation_reason') ??
      payloadString(event.payload, 'reason'),
    payload: event.payload,
  }));
}

export async function loadRetrievalFailures(
  from: string,
  to: string,
  limit = 200
): Promise<RetrievalFailureRow[]> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const { conversations, messages, events } = await loadPeriod(store, from, to);
  const conversationById = new Map(conversations.map((row) => [row.id, row]));
  const messagesByConversation = new Map<string, MessageRow[]>();

  for (const message of messages) {
    const list = messagesByConversation.get(message.conversation_id) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversation_id, list);
  }

  return events
    .filter(isFailure)
    .sort((left, right) => right.created_at.localeCompare(left.created_at))
    .slice(0, limit)
    .map((event) => {
      const conversationMessages = messagesByConversation.get(event.conversation_id) ?? [];
      const query =
        payloadString(event.payload, 'query') ??
        payloadString(event.payload, 'search_query') ??
        null;
      const preceding = [...conversationMessages]
        .reverse()
        .find(
          (message) =>
            message.role === 'user' &&
            new Date(message.created_at).getTime() <= new Date(event.created_at).getTime()
        );
      const documentIdsRaw = event.payload?.document_ids;
      const rankingRaw = event.payload?.ranking;
      const ranking = Array.isArray(rankingRaw)
        ? rankingRaw
            .map((entry) => {
              if (!entry || typeof entry !== 'object') return null;
              const record = entry as Record<string, unknown>;
              const documentId = record.document_id;
              if (typeof documentId !== 'string') return null;
              return {
                documentId,
                combinedScore:
                  typeof record.combined_score === 'number' ? record.combined_score : null,
                sourceClass: typeof record.source_class === 'string' ? record.source_class : null,
              };
            })
            .filter(
              (
                entry
              ): entry is {
                documentId: string;
                combinedScore: number | null;
                sourceClass: string | null;
              } => entry !== null
            )
            .slice(0, 5)
        : [];

      return {
        conversationId: event.conversation_id,
        createdAt: event.created_at,
        outcome: payloadString(event.payload, 'outcome'),
        code: payloadString(event.payload, 'code'),
        query,
        queryHash: payloadString(event.payload, 'query_hash'),
        method: payloadString(event.payload, 'method'),
        candidateCount:
          typeof event.payload?.candidate_count === 'number' ? event.payload.candidate_count : null,
        topSimilarity:
          typeof event.payload?.top_similarity === 'number' ? event.payload.top_similarity : null,
        question: preceding?.content ?? null,
        documentIds: Array.isArray(documentIdsRaw)
          ? documentIdsRaw.filter((value): value is string => typeof value === 'string')
          : [],
        ranking,
      };
    });
}

export async function loadTopicDrilldown(from: string, to: string): Promise<TopicRow[]> {
  const store = getServerSupabaseClient({ useServiceRole: true });
  const { conversations, messages, events } = await loadPeriod(store, from, to);
  const conversationById = new Map(conversations.map((row) => [row.id, row]));
  const messagesByConversation = new Map<string, MessageRow[]>();
  const docsByConversation = new Map<string, Set<string>>();

  for (const message of messages) {
    const list = messagesByConversation.get(message.conversation_id) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversation_id, list);
  }

  for (const event of events) {
    if (event.event_name !== 'brain_retrieval') continue;
    const raw = event.payload?.document_ids;
    if (!Array.isArray(raw)) continue;
    const docs = docsByConversation.get(event.conversation_id) ?? new Set<string>();
    for (const value of raw) if (typeof value === 'string') docs.add(value);
    docsByConversation.set(event.conversation_id, docs);
  }

  const questions: Array<{ question: string; conversationId: string; route: string }> = [];

  for (const conversation of conversations) {
    const conversationMessages = (messagesByConversation.get(conversation.id) ?? []).sort(
      (left, right) => left.message_index - right.message_index
    );

    conversationMessages.forEach((message, index) => {
      if (message.role !== 'user') return;
      const next = conversationMessages[index + 1];
      if (!next || next.role === 'user') {
        questions.push({
          question: message.content,
          conversationId: conversation.id,
          route: conversation.start_page,
        });
      }
    });
  }

  const clusters: Array<{ tokens: Set<string>; questions: typeof questions }> = [];

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

      const topic =
        Array.from(tokenCounts.entries())
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .slice(0, 3)
          .map(([token]) => token)
          .join(' ') || 'General enquiry';

      return {
        topic,
        occurrences: cluster.questions.length,
        routes: Array.from(
          new Set(
            cluster.questions
              .map((question) => conversationById.get(question.conversationId)?.start_page)
              .filter((value): value is string => Boolean(value))
          )
        ).slice(0, 5),
        documentIds: Array.from(
          new Set(
            cluster.questions.flatMap((question) =>
              Array.from(docsByConversation.get(question.conversationId) ?? [])
            )
          )
        ).slice(0, 10),
        conversationIds: Array.from(
          new Set(cluster.questions.map((question) => question.conversationId))
        ),
        questions: cluster.questions.map((question) => question.question).slice(0, 8),
      };
    })
    .sort(
      (left, right) => right.occurrences - left.occurrences || left.topic.localeCompare(right.topic)
    )
    .slice(0, 25);
}
