/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (error: unknown) => void;
};

const mockRetrieve = jest.fn() as unknown as MockFn;

jest.mock('stripe', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    checkout: {
      sessions: {
        retrieve: mockRetrieve,
      },
    },
  })),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
}));

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(),
}));

const serverAuth = require('@/lib/serverAuth') as {
  getServerSupabaseClient: { mockReturnValue: (value: unknown) => void };
};
const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

process.env.STRIPE_SECRET_KEY = 'sk_test_123';

const sessionId = 'cs_test_a1b2c3d4e5f6';

function makeRequest(id = sessionId): Request {
  return new Request(`http://localhost/api/postcards/order-success?session_id=${id}`);
}

function makeStore(order: { id: string; status: string; amount: number } | null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: order, error: null }),
        }),
      }),
    }),
  };
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: sessionId,
    payment_status: 'paid',
    metadata: {
      type: 'postcard_v1',
      orderId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRetrieve.mockResolvedValue(session());
  serverAuth.getServerSupabaseClient.mockReturnValue(
    makeStore({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'PAID', amount: 2900 })
  );
});

describe('GET /api/postcards/order-success', () => {
  it('rejects an invalid checkout session id', async () => {
    const response = await GET(makeRequest('not-a-session'));

    expect(response.status).toBe(400);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it('reports confirmation only from the webhook-written order status', async () => {
    const response = await GET(makeRequest());
    const json = (await response.json()) as {
      order: { confirmed: boolean; status: string; amount: number };
    };

    expect(response.status).toBe(200);
    expect(json.order.confirmed).toBe(true);
    expect(json.order.status).toBe('PAID');
    expect(json.order.amount).toBe(2900);
  });

  it('does not confirm a paid Stripe session before the webhook updates the order', async () => {
    serverAuth.getServerSupabaseClient.mockReturnValue(
      makeStore({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'PENDING', amount: 2900 })
    );

    const response = await GET(makeRequest());
    const json = (await response.json()) as {
      order: { confirmed: boolean; paymentReceived: boolean; status: string };
    };

    expect(response.status).toBe(200);
    expect(json.order.paymentReceived).toBe(true);
    expect(json.order.confirmed).toBe(false);
    expect(json.order.status).toBe('PENDING');
  });

  it('treats a cancelled order as unconfirmed', async () => {
    mockRetrieve.mockResolvedValue(session({ payment_status: 'unpaid' }));
    serverAuth.getServerSupabaseClient.mockReturnValue(
      makeStore({ id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: 'CANCELLED', amount: 2900 })
    );

    const response = await GET(makeRequest());
    const json = (await response.json()) as {
      order: { confirmed: boolean; paymentReceived: boolean };
    };

    expect(json.order.confirmed).toBe(false);
    expect(json.order.paymentReceived).toBe(false);
  });

  it('does not leak order or personal data', async () => {
    const response = await GET(makeRequest());
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('@');
    expect(body).not.toContain('address');
    expect(body).not.toContain('message');
    expect(body).not.toContain('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('returns a generic error when Stripe is unavailable', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockRetrieve.mockRejectedValue(new Error('SECRET stripe token'));

    const response = await GET(makeRequest());
    const json = (await response.json()) as { error?: string };

    expect(response.status).toBe(500);
    expect(json.error).toBe('Could not read the order status.');
    expect(JSON.stringify(json)).not.toContain('SECRET');

    errorSpy.mockRestore();
  });

  it('returns 404 for a checkout session that is not a postcard order', async () => {
    mockRetrieve.mockResolvedValue(session({ metadata: { type: 'tribute_v1' } }));

    const response = await GET(makeRequest());

    expect(response.status).toBe(404);
  });
});
