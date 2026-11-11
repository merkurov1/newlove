/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (value: unknown) => void;
};

const mockRetrieve = jest.fn() as unknown as MockFn;
const mockCookieSet = jest.fn() as unknown as MockFn;

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    checkout: { sessions: { retrieve: mockRetrieve } },
  })),
}));

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({ set: mockCookieSet })),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
}));

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(() => ({ mocked: true })),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  recordPierrotEventByConversationId: jest.fn(async () => true),
}));

const eventStore = require('@/lib/pierrot/serverStore') as {
  recordPierrotEventByConversationId: MockFn;
};
const { GET } = require('../verify/route') as {
  GET: (request: Request) => Promise<Response>;
};

const sessionId = 'cs_test_a1b2c3d4e5f6';
const conversationId = '11111111-1111-4111-8111-111111111111';

function makeRequest() {
  return new Request(`http://localhost/api/unframed/verify?session_id=${sessionId}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRetrieve.mockResolvedValue({
    id: sessionId,
    payment_status: 'paid',
    amount_total: 1500,
    currency: 'usd',
    metadata: {
      type: 'unframed_book',
      pierrotAttribution: `punf_${conversationId}`,
    },
  });
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.NEXTAUTH_SECRET = 'test-unframed-access-secret-32-chars';
});

describe('GET /api/unframed/verify', () => {
  it('confirms paid access and records a trusted purchase event', async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    expect(mockCookieSet).toHaveBeenCalledTimes(1);
    expect(eventStore.recordPierrotEventByConversationId).toHaveBeenCalledWith(
      { mocked: true },
      expect.objectContaining({
        conversationId,
        eventName: 'unframed_purchase_confirmed',
        eventKey: `unframed_purchase_confirmed:${sessionId}`,
      })
    );

    const call = eventStore.recordPierrotEventByConversationId.mock.calls[0][1] as {
      payload: Record<string, unknown>;
    };
    expect(JSON.stringify(call.payload)).not.toContain('@');
  });

  it('does not confirm or record an unpaid session', async () => {
    mockRetrieve.mockResolvedValue({
      id: sessionId,
      payment_status: 'unpaid',
      metadata: { type: 'unframed_book' },
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(400);
    expect(mockCookieSet).not.toHaveBeenCalled();
    expect(eventStore.recordPierrotEventByConversationId).not.toHaveBeenCalled();
  });

  it('rejects an invalid session id before calling Stripe', async () => {
    const response = await GET(new Request('http://localhost/api/unframed/verify?session_id=bad'));

    expect(response.status).toBe(400);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it('can be reopened from the same paid success URL and reissues access', async () => {
    const first = await GET(makeRequest());
    const second = await GET(makeRequest());

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mockCookieSet).toHaveBeenCalledTimes(2);
  });

  it('returns a clear 404 for an unknown session without leaking Stripe details', async () => {
    mockRetrieve.mockRejectedValue({
      type: 'StripeInvalidRequestError',
      message: 'No such checkout.session: cs_test_missing',
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Checkout session not found' });
  });

  it('returns 503 when Stripe verification is temporarily unavailable', async () => {
    mockRetrieve.mockRejectedValue({
      type: 'StripeAPIError',
      message: 'Stripe is down',
    });

    const response = await GET(makeRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'Verification temporarily unavailable',
    });
  });
});
