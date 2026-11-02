/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
};

const mockCreateSession = jest.fn() as unknown as MockFn;

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    checkout: {
      sessions: {
        create: mockCreateSession,
      },
    },
  })),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  createPierrotStore: jest.fn(() => ({})),
  recordPierrotEventByConversationId: jest.fn(async () => true),
}));

const pierrotStore = require('@/lib/pierrot/serverStore') as {
  recordPierrotEventByConversationId: {
    mock: { calls: unknown[][] };
    mockClear: () => void;
  };
};

const { POST } = require('../route') as {
  POST: (request: Request) => Promise<Response>;
};

const conversationId = '11111111-1111-4111-8111-111111111111';
const attribution = `ptri_${conversationId}`;

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/tribute/checkout', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      amount: 20,
      currency: 'usd',
      donor_name: 'Pilgrim',
      message: 'Fuel for the Temple',
      ...overrides,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateSession.mockResolvedValue({
    id: 'cs_tribute_test',
    url: 'https://checkout.stripe.com/tribute',
  });
  pierrotStore.recordPierrotEventByConversationId.mockClear();
});

describe('POST /api/tribute/checkout', () => {
  it('passes the opaque attribution through Stripe metadata and records only checkout start', async () => {
    const response = await POST(makeRequest({ pierrotAttribution: attribution }));

    expect(response.status).toBe(200);

    const [session] = mockCreateSession.mock.calls[0] as [Record<string, any>];
    expect(session.metadata).toMatchObject({
      type: 'tribute_v1',
      pierrotAttribution: attribution,
    });
    expect(session.line_items[0].price_data.unit_amount).toBe(2000);

    expect(pierrotStore.recordPierrotEventByConversationId).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conversationId,
        eventName: 'checkout_started',
        eventKey: 'checkout_started:cs_tribute_test',
        payload: expect.objectContaining({
          offer_id: 'temple_tribute',
          amount_total: 2000,
          currency: 'usd',
        }),
      })
    );
  });

  it('drops malformed attribution instead of passing it to Stripe', async () => {
    const response = await POST(
      makeRequest({ pierrotAttribution: 'donor@example.com' })
    );

    expect(response.status).toBe(200);

    const [session] = mockCreateSession.mock.calls[0] as [Record<string, any>];
    expect(session.metadata).not.toHaveProperty('pierrotAttribution');
  });

  it('preserves the arbitrary USD payment flow', async () => {
    const response = await POST(makeRequest({ amount: 7.5 }));

    expect(response.status).toBe(200);

    const [session] = mockCreateSession.mock.calls[0] as [Record<string, any>];
    expect(session.line_items[0].price_data.unit_amount).toBe(750);
    expect(session.line_items[0].price_data.currency).toBe('usd');
  });
});
