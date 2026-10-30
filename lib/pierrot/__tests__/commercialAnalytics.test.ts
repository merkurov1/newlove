/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/pierrot/serverStore', () => ({
  recordPierrotEvent: jest.fn(async () => true),
  recordPierrotEventByConversationId: jest.fn(async () => true),
}));

const storeModule = require('@/lib/pierrot/serverStore') as {
  recordPierrotEvent: {
    mock: { calls: unknown[][] };
    mockClear: () => void;
  };
};
const {
  recordPierrotCommercialAnalytics,
  recordPierrotOfferShown,
  recordPierrotPurchaseCompleted,
} = require('../commercialAnalytics') as {
  recordPierrotCommercialAnalytics: (
    store: unknown,
    input: {
      conversationId: string;
      sessionId: string;
      userMessageId: string;
      intent: ReturnType<typeof import('../intents').classifyPierrotIntent>;
      plan: ReturnType<typeof import('../commercial').planPierrotResponse>;
    }
  ) => Promise<void>;
  recordPierrotOfferShown: (
    store: unknown,
    input: {
      conversationId: string;
      sessionId: string;
      userMessageId: string;
      intent: ReturnType<typeof import('../intents').classifyPierrotIntent>;
      plan: ReturnType<typeof import('../commercial').planPierrotResponse>;
    }
  ) => Promise<void>;
  recordPierrotPurchaseCompleted: (
    store: unknown,
    input: {
      conversationId: string;
      eventKey: string;
      offerId: string;
      orderId?: string | null;
      providerSessionId?: string | null;
      amountTotal?: number | null;
      currency?: string | null;
      source: 'postcard_webhook' | 'unframed_webhook' | 'unframed_verify';
    }
  ) => Promise<boolean>;
};
const { planPierrotResponse } = require('../commercial') as typeof import('../commercial');
const { classifyPierrotIntent } = require('../intents') as typeof import('../intents');

const base = {
  conversationId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  userMessageId: '33333333-3333-4333-8333-333333333333',
};

function events() {
  return storeModule.recordPierrotEvent.mock.calls.map(
    (call) => call[1] as { eventName: string; payload?: Record<string, unknown> }
  );
}

describe('Pierrot commercial analytics', () => {
  it('distinguishes interest, eligibility, selection, display and CTA', async () => {
    storeModule.recordPierrotEvent.mockClear();
    const message = 'I have been thinking about love and distance lately.';
    const intent = classifyPierrotIntent(message);
    const plan = planPierrotResponse({
      intent,
      language: 'en',
      message,
      pathname: '/heartandangel',
    });

    await recordPierrotCommercialAnalytics({} as never, {
      ...base,
      intent,
      plan,
    });
    await recordPierrotOfferShown({} as never, {
      ...base,
      intent,
      plan,
    });

    const names = events().map((event) => event.eventName);

    expect(names).toEqual([
      'intent_classified',
      'interest_detected',
      'offer_eligible',
      'offer_selected',
      'offer_shown',
      'cta_shown',
    ]);
    expect(names).not.toContain('offer_viewed');
    expect(names).not.toContain('order_paid');
    expect(names).not.toContain('purchase_completed');

    const selected = events().find((event) => event.eventName === 'offer_selected');
    expect(selected?.payload).toMatchObject({
      product_id: 'heart_angel_postcard',
      offer_id: 'heart_angel_postcard',
      source_page: '/heartandangel',
      triggering_intent: 'unknown',
    });

    const shown = events().find((event) => event.eventName === 'cta_shown');
    expect(shown?.payload).toMatchObject({
      offer_id: 'heart_angel_postcard',
      destination: '/heartandangel/card#order',
    });
    expect(JSON.stringify(shown?.payload)).not.toContain(
      'I have been thinking about love and distance'
    );
  });

  it('records the declined offer so the next turn can suppress it', async () => {
    storeModule.recordPierrotEvent.mockClear();
    const message = 'No thanks, not interested.';
    const intent = classifyPierrotIntent(message);
    const plan = planPierrotResponse({
      intent,
      language: 'en',
      message,
      pathname: '/heartandangel',
      previousOfferId: 'heart_angel_postcard',
    });

    await recordPierrotCommercialAnalytics({} as never, {
      ...base,
      intent,
      plan,
    });

    const declined = events().find((event) => event.eventName === 'commercial_declined');
    expect(declined?.payload).toMatchObject({
      offer_id: 'heart_angel_postcard',
      product_id: 'heart_angel_postcard',
    });
    expect(events().map((event) => event.eventName)).not.toContain('cta_shown');
  });

  it('records only intent classification when no offer is selected', async () => {
    storeModule.recordPierrotEvent.mockClear();
    const message = 'What is context architecture?';
    const intent = classifyPierrotIntent(message);
    const plan = planPierrotResponse({
      intent,
      language: 'en',
      message,
      pathname: '/heartandangel',
    });

    await recordPierrotCommercialAnalytics({} as never, {
      ...base,
      intent,
      plan,
    });

    expect(events().map((event) => event.eventName)).toEqual(['intent_classified']);
  });

  it('records a purchase only through the trusted confirmation helper', async () => {
    const { recordPierrotEventByConversationId } = require('@/lib/pierrot/serverStore') as {
      recordPierrotEventByConversationId: { mockClear: () => void; mock: { calls: unknown[][] } };
    };

    recordPierrotEventByConversationId.mockClear();

    await recordPierrotPurchaseCompleted({} as never, {
      conversationId: base.conversationId,
      eventKey: 'purchase_completed:cs_test',
      offerId: 'unframed',
      providerSessionId: 'cs_test',
      amountTotal: 1500,
      currency: 'usd',
      source: 'unframed_webhook',
    });

    const [, event] = recordPierrotEventByConversationId.mock.calls[0] as [
      unknown,
      { eventName: string; payload: Record<string, unknown> },
    ];

    expect(event.eventName).toBe('purchase_completed');
    expect(event.payload).toMatchObject({
      offer_id: 'unframed',
      product_id: 'unframed',
      provider_session_id: 'cs_test',
      amount_total: 1500,
      currency: 'usd',
      source: 'unframed_webhook',
    });
  });
});
