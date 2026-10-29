/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/pierrot/serverStore', () => ({
  recordPierrotEvent: jest.fn(async () => true),
}));

const storeModule = require('@/lib/pierrot/serverStore') as {
  recordPierrotEvent: {
    mock: { calls: unknown[][] };
    mockClear: () => void;
  };
};
const { recordPierrotCommercialAnalytics } = require('../commercialAnalytics') as {
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
  it('distinguishes planner selection, rendered CTA and confirmation is absent', async () => {
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

    const names = events().map((event) => event.eventName);

    expect(names).toEqual(['intent_classified', 'offer_selected', 'offer_viewed', 'cta_shown']);
    expect(names).not.toContain('order_paid');
    expect(names).not.toContain('checkout_started');

    const selected = events().find((event) => event.eventName === 'offer_selected');
    expect(selected?.payload).toMatchObject({
      offer_id: 'heart_angel_postcard',
      stage: 'interest',
      proactive: true,
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
});
