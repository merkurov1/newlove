/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
};

const mockCreate = jest.fn() as unknown as MockFn;

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(() => ({ checkout: { sessions: { create: mockCreate } } })),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  createPierrotStore: jest.fn(() => ({ mocked: true })),
  recordPierrotEventByConversationId: jest.fn(async () => true),
}));

const { POST } = require('../checkout/route') as {
  POST: (request: Request) => Promise<Response>;
};
const eventStore = require('@/lib/pierrot/serverStore') as {
  recordPierrotEventByConversationId: MockFn;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue({ id: 'session-1', url: 'https://checkout.stripe.com/session' });
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
});

describe('POST /api/unframed/checkout', () => {
  it('uses the server-side manuscript access amount, not a client amount', async () => {
    const response = await POST(
      new Request('http://localhost/api/unframed/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://merkurov.love' },
        body: JSON.stringify({
          amount: 1,
          pierrotAttribution: 'punf_11111111-1111-4111-8111-111111111111',
        }),
      })
    );

    expect(response.status).toBe(200);
    const [session] = mockCreate.mock.calls[0] as [Record<string, any>];
    expect(session.line_items[0].price_data.unit_amount).toBe(1500);
    expect(session.metadata.type).toBe('unframed_book');
    expect(session.metadata.pierrotAttribution).toBe('punf_11111111-1111-4111-8111-111111111111');
    expect(eventStore.recordPierrotEventByConversationId).toHaveBeenCalledWith(
      { mocked: true },
      expect.objectContaining({
        conversationId: '11111111-1111-4111-8111-111111111111',
        eventName: 'checkout_started',
        eventKey: 'checkout_started:session-1',
      })
    );
  });

  it('drops a malformed attribution', async () => {
    await POST(
      new Request('http://localhost/api/unframed/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://merkurov.love' },
        body: JSON.stringify({ pierrotAttribution: 'person@example.com' }),
      })
    );

    const [session] = mockCreate.mock.calls[0] as [Record<string, any>];
    expect(session.metadata).not.toHaveProperty('pierrotAttribution');
  });
});
