/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { answerPierrotCommercialQuestion } from '../commercialIntelligence';

type Dataset = Record<string, unknown[]>;

function createStore(current: Dataset, previous: Dataset) {
  return {
    from(table: string) {
      let start: string | null = null;
      let head = false;

      const rowsFor = () => {
        const boundary = new Date('2026-10-27T00:00:00.000Z').toISOString();
        const dataset = start && start < boundary ? previous : current;
        return dataset[table] ?? [];
      };

      const builder: any = {
        select: (_columns: string, options?: { head?: boolean }) => {
          head = options?.head === true;
          return builder;
        },
        gte: (_column: string, value: string) => {
          start = value;
          return builder;
        },
        lt: () => builder,
        order: () => builder,
        range: async () => ({ data: rowsFor(), error: null }),
        then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve({
            data: head ? null : rowsFor(),
            count: rowsFor().length,
            error: null,
          }).then(resolve, reject),
      };

      return builder;
    },
  } as never;
}

const now = new Date('2026-11-02T12:00:00.000Z');

function event(
  eventName: string,
  conversationId: string,
  offerId = 'unframed',
  payload: Record<string, unknown> = {}
) {
  return {
    event_name: eventName,
    offer_id: offerId,
    product_id: offerId,
    conversation_id: conversationId,
    payload,
    created_at: '2026-11-01T10:00:00.000Z',
  };
}

describe('Pierrot commercial intelligence', () => {
  it('reports real funnel evidence and avoids inventing revenue', async () => {
    const conversations = Array.from({ length: 20 }, (_, index) => `conv-${index + 1}`);

    const current: Dataset = {
      pierrot_v_events: conversations.map((id) => event('interest_detected', id)),
      pierrot_v_purchases: [],
      pierrot_v_donations: [],
      pierrot_v_subscription_conversions: [],
      pierrot_v_postcard_sales: [],
      pierrot_v_tribute_donations: [],
    };

    const previous: Dataset = {
      pierrot_v_events: [],
      pierrot_v_purchases: [],
      pierrot_v_donations: [],
      pierrot_v_subscription_conversions: [],
      pierrot_v_postcard_sales: [],
      pierrot_v_tribute_donations: [],
    };

    const answer = await answerPierrotCommercialQuestion({
      question: 'Сколько мы заработали, почему так мало и что мне делать?',
      language: 'ru',
      store: createStore(current, previous),
      now,
      timezone: 'Europe/London',
    });

    expect(answer).toContain('последние семь дней');
    expect(answer).toContain('подтверждённых продаж нет');
    expect(answer).toContain('Temple');
    expect(answer).toContain('GBP и USD');
    expect(answer).toContain('Что я предлагаю');
    expect(answer).not.toContain('$15');
    expect(answer).not.toContain('$20');
  });

  it('keeps product sales, donations and subscriptions separate', async () => {
    const conversation = 'conv-aaaaaaaa';

    const current: Dataset = {
      pierrot_v_events: [
        event('interest_detected', conversation),
        event('offer_shown', conversation),
        event('checkout_started', conversation, 'unframed'),
        event('checkout_started', conversation, 'temple_tribute', {
          amount_total: 2000,
          currency: 'usd',
          provider_session_id: 'cs_tribute',
        }),
        event('donation_completed', conversation, 'temple_tribute', {
          amount_total: 2000,
          currency: 'usd',
          provider_session_id: 'cs_tribute',
        }),
      ],
      pierrot_v_purchases: [
        {
          conversation_id: conversation,
          offer_id: 'unframed',
          order_id: null,
          provider_session_id: 'cs_unframed',
          amount_total: 1500,
          currency: 'usd',
          source_event: 'purchase_completed',
          created_at: '2026-11-01T11:00:00.000Z',
        },
      ],
      pierrot_v_donations: [
        {
          conversation_id: conversation,
          offer_id: 'temple_tribute',
          provider_session_id: 'cs_tribute',
          amount_total: 2000,
          currency: 'usd',
          source: 'tribute_webhook',
          created_at: '2026-11-01T11:05:00.000Z',
        },
      ],
      pierrot_v_subscription_conversions: [
        {
          subscriber_id: 'sub-1',
          conversation_id: conversation,
          confirmed_at: '2026-11-01T11:10:00.000Z',
          is_first_confirmation: true,
          subscriber_created_at: '2026-11-01T11:09:00.000Z',
        },
      ],
      pierrot_v_postcard_sales: [
        {
          order_id: 'order-unattributed-gbp',
          offer_id: 'heart_angel_postcard',
          amount_minor: 2900,
          currency: 'gbp',
          status: 'PAID',
          occurred_at: '2026-11-01T10:30:00.000Z',
        },
      ],
      pierrot_v_tribute_donations: [
        {
          stripe_session_id: 'cs_tribute',
          amount_minor: 2000,
          currency: 'usd',
          occurred_at: '2026-11-01T11:05:00.000Z',
        },
      ],
    };

    const previous: Dataset = { ...current, pierrot_v_purchases: [], pierrot_v_donations: [], pierrot_v_subscription_conversions: [] };

    const answer = await answerPierrotCommercialQuestion({
      question: 'Сколько мы заработали?',
      language: 'ru',
      store: createStore(current, previous),
      now,
      timezone: 'Europe/London',
    });

    expect(answer).toContain('UNFRAMED: 1');
    expect(answer).toContain('$15.00');
    expect(answer).toContain('Temple: 1 пожертвований');
    expect(answer).toContain('$20.00');
    expect(answer).toContain('£29.00');
    expect(answer).toContain('Flow: 1 новых подтверждённых подписок');
    expect(answer).not.toContain('куплено за $44');
    expect(answer).not.toContain('$44.00');
    expect(answer).not.toContain('£44.00');
  });

  it('does not assign site sales to Pierrot when attribution is missing', async () => {
    const current: Dataset = {
      pierrot_v_events: [],
      pierrot_v_purchases: [],
      pierrot_v_donations: [],
      pierrot_v_subscription_conversions: [],
      pierrot_v_postcard_sales: [
        {
          order_id: 'order-without-pierrot',
          offer_id: 'heart_angel_postcard',
          amount_minor: 2900,
          currency: 'gbp',
          status: 'PAID',
          occurred_at: '2026-11-01T10:00:00.000Z',
        },
      ],
      pierrot_v_tribute_donations: [],
    };

    const answer = await answerPierrotCommercialQuestion({
      question: 'Сколько продаж пришло благодаря Пьеро?',
      language: 'ru',
      store: createStore(current, current),
      now,
      timezone: 'Europe/London',
    });

    expect(answer).toContain('Открытки: подтверждённых продаж нет');
    expect(answer).toContain('Все оплаченные открытки на сайте: 1');
    expect(answer).toContain('Открытки без подтверждённой связи с Пьеро: 1');
  });

  it('does not count a returning subscriber as a new confirmed subscription', async () => {
    const conversation = 'conv-bbbbbbbb';

    const current: Dataset = {
      pierrot_v_events: [],
      pierrot_v_purchases: [],
      pierrot_v_donations: [],
      pierrot_v_subscription_conversions: [
        {
          subscriber_id: 'returning-subscriber',
          conversation_id: conversation,
          confirmed_at: '2026-11-01T11:10:00.000Z',
          is_first_confirmation: true,
          // The subscriber record predates the reporting period.
          subscriber_created_at: '2026-09-01T11:10:00.000Z',
        },
        {
          subscriber_id: 'new-subscriber',
          conversation_id: conversation,
          confirmed_at: '2026-11-01T12:10:00.000Z',
          is_first_confirmation: true,
          subscriber_created_at: '2026-11-01T12:00:00.000Z',
        },
      ],
      pierrot_v_postcard_sales: [],
      pierrot_v_tribute_donations: [],
    };

    const answer = await answerPierrotCommercialQuestion({
      question: 'Сколько новых подписчиков Flow?',
      language: 'ru',
      store: createStore(current, current),
      now,
      timezone: 'Europe/London',
    });

    expect(answer).toContain('Flow: 1 новых подтверждённых подписок');
    expect(answer).toContain('Все новые подтверждённые подписки Flow: 1');
  });

  it('states when data is insufficient instead of diagnosing a cause', async () => {
    const empty: Dataset = {
      pierrot_v_events: [],
      pierrot_v_purchases: [],
      pierrot_v_donations: [],
      pierrot_v_subscription_conversions: [],
      pierrot_v_postcard_sales: [],
      pierrot_v_tribute_donations: [],
    };

    const answer = await answerPierrotCommercialQuestion({
      question: 'Почему так мало?',
      language: 'ru',
      store: createStore(empty, empty),
      now,
      timezone: 'Europe/London',
    });

    expect(answer).toContain('Этого мало');
    expect(answer).toContain('не доказательство');
    expect(answer).not.toContain('цена виновата');
  });

  it('returns a weekly review with 90-day goals and an explicit assessment', async () => {
    const empty: Dataset = {
      pierrot_v_events: [],
      pierrot_v_purchases: [],
      pierrot_v_donations: [],
      pierrot_v_subscription_conversions: [],
      pierrot_v_postcard_sales: [],
      pierrot_v_tribute_donations: [],
    };

    const answer = await answerPierrotCommercialQuestion({
      question: 'Пьеро, как у нас дела?',
      language: 'ru',
      store: createStore(empty, empty),
      now,
      timezone: 'Europe/London',
    });

    expect(answer).toContain('Цели 90-дневного эксперимента');
    expect(answer).toContain('UNFRAMED: 0 / 1');
    expect(answer).toContain('Flow: 0 / 10');
    expect(answer).toContain('Temple Tributes');
    expect(answer).toContain('Оценка: данных недостаточно');
  });
});
