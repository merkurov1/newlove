/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  buildPierrotSnapshot,
  normalizePeriod,
  type AnalyticsFilters,
  type ConversationRow,
  type EventRow,
  type LeadRow,
  type MessageRow,
  type SubscriptionEventRow,
} from '../pierrotIntelligence';

const period = {
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-31T23:59:59.999Z',
};

const filters: AnalyticsFilters = { ...period, limit: 100 };

function conversation(id: string, overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id,
    status: 'active',
    language: 'en',
    start_page: '/',
    started_at: '2026-10-10T10:00:00.000Z',
    ...overrides,
  };
}

function event(
  conversationId: string,
  eventName: string,
  payload: Record<string, unknown>,
  key = `${eventName}:${Math.random()}`
): EventRow {
  return {
    conversation_id: conversationId,
    event_name: eventName,
    event_key: `${conversationId}:${key}`,
    payload,
    created_at: '2026-10-10T10:01:00.000Z',
  };
}

function message(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  index: number
): MessageRow {
  return {
    id: `${conversationId}-m${index}`,
    conversation_id: conversationId,
    role,
    content,
    message_index: index,
    created_at: '2026-10-10T10:00:30.000Z',
  };
}

function subscription(
  conversationId: string,
  eventName: string,
  key: string
): SubscriptionEventRow {
  return {
    event_name: eventName,
    event_key: key,
    subscriber_id: 'sub-1',
    conversation_id: conversationId,
    payload: {},
    created_at: '2026-10-10T10:02:00.000Z',
  };
}

function lead(conversationId: string): LeadRow {
  return {
    id: 'lead-1',
    conversation_id: conversationId,
    status: 'contact_requested',
    need_type: 'analysis',
    stage: 'exploring',
    timeline: 'this_quarter',
    summary: 'analysis / exploring / this_quarter',
    created_at: '2026-10-10T10:03:00.000Z',
  };
}

function fixtures() {
  const conversations = [
    conversation('c1', { language: 'en' }),
    conversation('c2', { language: 'ru' }),
    conversation('c3', { language: 'en' }),
    conversation('c4', { language: 'en' }),
  ];

  const events = [
    event('c1', 'intent_classified', { intent: 'purchase_intent', topic: 'purchase' }),
    event('c1', 'offer_viewed', { offer_id: 'heart_angel_postcard' }),
    event('c1', 'cta_shown', { offer_id: 'heart_angel_postcard' }),
    event('c1', 'offer_action_clicked', { offer_id: 'heart_angel_postcard' }),
    event('c1', 'order_paid', { offer_id: 'heart_angel_postcard' }),
    event('c2', 'intent_classified', { intent: 'subscription_intent' }),
    event('c2', 'offer_viewed', { offer_id: 'journal_flow' }),
    event('c2', 'cta_shown', { offer_id: 'journal_flow' }),
    event('c2', 'subscribe_cta_clicked', { offer_id: 'journal_flow' }),
    event('c3', 'intent_classified', { intent: 'service_inquiry' }),
    event('c3', 'offer_viewed', { offer_id: 'art_engine' }),
    event('c3', 'cta_shown', { offer_id: 'art_engine' }),
    event('c3', 'service_inquiry_started', { offer_id: 'advising' }),
    event('c3', 'service_inquiry_qualified', { offer_id: 'advising' }),
    event('c3', 'service_inquiry_submitted', { offer_id: 'advising' }),
    event('c3', 'assistant_failed', { code: 'ai_unavailable' }),
    event('c4', 'intent_classified', { intent: 'book_inquiry' }),
    event('c4', 'offer_viewed', { offer_id: 'unframed' }),
    event('c4', 'cta_shown', { offer_id: 'unframed' }),
    event('c4', 'offer_action_clicked', { offer_id: 'unframed' }),
    event('c4', 'unframed_request_submitted', { offer_id: 'unframed' }),
    event('c4', 'unframed_purchase_confirmed', { offer_id: 'unframed' }),
  ];

  const messages = [
    message('c1', 'user', 'I want to buy the postcard', 1),
    message('c1', 'assistant', 'The order form is here.', 2),
    message('c2', 'user', 'How do I subscribe?', 1),
    message('c2', 'assistant', 'Use the form.', 2),
    message('c3', 'user', 'Can you analyse my collection?', 1),
    message('c3', 'assistant', 'Where are you in the process?', 2),
    message('c3', 'user', 'Not sure', 3),
    message('c4', 'user', 'How can I read UNFRAMED?', 1),
    message('c4', 'assistant', 'The manuscript reader is here.', 2),
  ];

  const subscriptionEvents = [
    subscription('c2', 'subscription_submitted', 'submitted:c2'),
    subscription('c2', 'subscription_confirmed', 'confirmed:c2'),
  ];

  return {
    conversations,
    events,
    messages,
    subscriptionEvents,
    leads: [lead('c3')],
    postcardOrders: [
      {
        id: 'po1',
        status: 'PAID',
        amount: 2900,
        createdAt: '2026-10-10T10:04:00.000Z',
        updatedAt: '2026-10-10T10:04:00.000Z',
      },
    ],
  };
}

describe('Pierrot Intelligence aggregation', () => {
  it('counts confirmed outcomes from trusted events, not clicks', () => {
    const snapshot = buildPierrotSnapshot({ ...fixtures(), period, filters });

    expect(snapshot.overview.conversationsStarted).toBe(4);
    expect(snapshot.overview.conversationsWithReplies).toBe(4);
    expect(snapshot.overview.confirmedSubscriptions).toBe(1);
    expect(snapshot.overview.confirmedPurchases).toBe(2);
    expect(snapshot.overview.qualifiedLeads).toBe(1);
    expect(snapshot.overview.errors).toBe(1);
    expect(snapshot.overview.unresolved).toBe(1);
  });

  it('builds the four product funnels from real event names', () => {
    const snapshot = buildPierrotSnapshot({ ...fixtures(), period, filters });

    expect(snapshot.funnels.postcard.find((stage) => stage.key === 'confirmed')?.value).toBe(1);
    expect(snapshot.funnels.journal.find((stage) => stage.key === 'submitted')?.value).toBe(1);
    expect(snapshot.funnels.journal.find((stage) => stage.key === 'confirmed')?.value).toBe(1);
    expect(
      snapshot.funnels.art_engine.find((stage) => stage.key === 'service_qualified')?.value
    ).toBe(1);
    expect(
      snapshot.funnels.unframed.find((stage) => stage.key === 'request_submitted')?.value
    ).toBe(1);
    expect(snapshot.funnels.unframed.find((stage) => stage.key === 'confirmed')?.value).toBe(1);
  });

  it('filters conversations by language, product, outcome and error', () => {
    const byLanguage = buildPierrotSnapshot({
      ...fixtures(),
      period,
      filters: { ...filters, language: 'ru' },
    });
    const byProduct = buildPierrotSnapshot({
      ...fixtures(),
      period,
      filters: { ...filters, product: 'unframed' },
    });
    const byOutcome = buildPierrotSnapshot({
      ...fixtures(),
      period,
      filters: { ...filters, outcome: 'purchase' },
    });
    const byError = buildPierrotSnapshot({
      ...fixtures(),
      period,
      filters: { ...filters, error: true },
    });

    expect(byLanguage.conversations.map((item) => item.id)).toEqual(['c2']);
    expect(byProduct.conversations.map((item) => item.id)).toEqual(['c4']);
    expect(byOutcome.conversations.map((item) => item.id).sort()).toEqual(['c1', 'c4']);
    expect(byError.conversations.map((item) => item.id)).toEqual(['c3']);
  });

  it('returns an empty, honest snapshot for no data', () => {
    const snapshot = buildPierrotSnapshot({
      conversations: [],
      events: [],
      messages: [],
      subscriptionEvents: [],
      leads: [],
      period,
      filters,
    });

    expect(snapshot.overview.conversationsStarted).toBe(0);
    expect(snapshot.overview.confirmedPurchases).toBe(0);
    expect(snapshot.volume.sampleSufficient).toBe(false);
    expect(snapshot.conversations).toEqual([]);
    expect(snapshot.recommendations).toEqual([]);
  });

  it('does not crash when a conversation has no messages left', () => {
    const snapshot = buildPierrotSnapshot({
      conversations: [conversation('empty')],
      events: [event('empty', 'intent_classified', { intent: 'unknown' })],
      messages: [],
      subscriptionEvents: [],
      leads: [],
      period,
      filters,
    });

    expect(snapshot.conversations[0].lastMessageRole).toBeNull();
    expect(snapshot.overview.unresolved).toBe(1);
  });

  it('provides evidence links and low confidence for a small sample', () => {
    const snapshot = buildPierrotSnapshot({ ...fixtures(), period, filters });

    expect(snapshot.insights.length).toBeGreaterThan(0);
    for (const insight of snapshot.insights) {
      expect(insight.period).toEqual(period);
      expect(insight.confidence).toBe('low');
      for (const item of insight.evidence) {
        expect(item.href).toContain('/admin/pierrot?conversation=');
      }
    }
  });

  it('keeps price objections as observations, not causal conclusions', () => {
    const snapshot = buildPierrotSnapshot({
      conversations: [conversation('price')],
      events: [
        event('price', 'intent_classified', {
          intent: 'offer_information',
          topic: 'price_objection',
        }),
        event('price', 'commercial_declined', { offer_id: 'heart_angel_postcard' }),
      ],
      messages: [message('price', 'user', 'Too expensive', 1)],
      subscriptionEvents: [],
      leads: [],
      period,
      filters,
    });
    const objection = snapshot.insights.find((item) => item.id === 'price-objections');

    expect(objection?.kind).toBe('observed');
    expect(objection?.detail).toContain('does not prove');
  });

  it('normalizes the period to at most 90 days', () => {
    const normalized = normalizePeriod('2020-01-01', '2026-10-31');

    expect(new Date(normalized.from).getTime()).toBeGreaterThan(new Date('2026-07-01').getTime());
  });

  it('keeps offer_viewed separate from cta_shown and reports retrieval, feedback and handover', () => {
    const snapshot = buildPierrotSnapshot({
      conversations: [conversation('r1')],
      events: [
        event('r1', 'offer_viewed', { offer_id: 'heart_angel_postcard' }),
        event('r1', 'brain_retrieval', {
          mode: 'brain_v2',
          outcome: 'relevant_results',
          used_context: true,
          document_count: 2,
          chunk_count: 3,
          latency_ms: 40,
        }),
        event('r1', 'answer_feedback', { rating: 'down' }),
        event('r1', 'human_requested', { request_id: 'request-1' }),
        event('r1', 'assistant_replied', {}),
      ],
      messages: [
        message('r1', 'user', 'What is in the archive?', 1),
        message('r1', 'assistant', 'Here is what I found.', 2),
      ],
      subscriptionEvents: [],
      leads: [],
      period,
      filters,
    });

    expect(snapshot.conversations[0].offersViewed).toEqual(['heart_angel_postcard']);
    expect(snapshot.conversations[0].ctaShown).toEqual([]);
    expect(snapshot.overview.retrieval).toMatchObject({
      attempts: 1,
      relevant: 1,
      contextUsed: 1,
      documents: 2,
      chunks: 3,
      averageLatencyMs: 40,
    });
    expect(snapshot.overview.feedback).toEqual({ up: 0, down: 1 });
    expect(snapshot.overview.handover.requested).toBe(1);
    expect(snapshot.overview.answers).toEqual({ replied: 1, failed: 0 });
    expect(snapshot.attention.some((item) => item.id === 'human:r1')).toBe(true);
    expect(snapshot.attention.some((item) => item.id === 'feedback:r1')).toBe(true);
  });
});
