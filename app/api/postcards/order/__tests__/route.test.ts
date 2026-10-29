/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (error: unknown) => void;
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

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
}));

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  recordPierrotEventByConversationId: jest.fn(async () => true),
}));

const serverAuth = require('@/lib/serverAuth') as {
  getServerSupabaseClient: { mockReturnValue: (value: unknown) => void };
};
const pierrotStore = require('@/lib/pierrot/serverStore') as {
  recordPierrotEventByConversationId: {
    mock: { calls: unknown[][] };
    mockResolvedValue: (value: unknown) => void;
    mockRejectedValue: (value: unknown) => void;
  };
};
const { POST } = require('../route') as {
  POST: (request: Request) => Promise<Response>;
};

const conversationId = '11111111-1111-4111-8111-111111111111';
const attribution = `pcard_${conversationId}`;

type StoreOptions = {
  postcard?: Record<string, unknown> | null;
  postcardError?: unknown;
  insertError?: unknown;
};

function makeStore(options: StoreOptions = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];

  const store = {
    from(table: string) {
      if (table === 'postcards') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data:
                    options.postcard === undefined
                      ? {
                          id: 'postcard_1',
                          title: 'Heart & Angel postcard',
                          description: 'Physical postcard',
                          image: 'https://example.com/card.jpg',
                          price: 2900,
                          available: true,
                        }
                      : options.postcard,
                  error: options.postcardError ?? null,
                }),
              }),
            }),
          }),
        };
      }

      if (table === 'postcard_orders') {
        return {
          insert: (row: Record<string, unknown>) => {
            inserted.push(row);
            return Promise.resolve({ error: options.insertError ?? null });
          },
          update: (row: Record<string, unknown>) => {
            updated.push(row);
            return {
              eq: async () => ({ error: null }),
            };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { store, inserted, updated };
}

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/postcards/order', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      postcardId: 'postcard_1',
      recipientName: 'Recipient Name',
      streetAddress: '1 Example Street',
      city: 'London',
      postalCode: 'SW1A 1AA',
      country: 'United Kingdom',
      email: 'buyer@example.com',
      customMessage: 'A private message',
      ...overrides,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateSession.mockResolvedValue({ url: 'https://checkout.stripe.com/session' });
  serverAuth.getServerSupabaseClient.mockReturnValue(makeStore().store);
});

describe('POST /api/postcards/order', () => {
  it('prices the order from the catalogue, never from the request', async () => {
    const { store } = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await POST(
      makeRequest({ price: 1, amount: 1, pierrotAttribution: attribution })
    );

    expect(response.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);

    const [session] = mockCreateSession.mock.calls[0] as [Record<string, any>];
    expect(session.line_items[0].price_data.unit_amount).toBe(2900);
    expect(session.metadata).toMatchObject({
      type: 'postcard_v1',
      postcardId: 'postcard_1',
      pierrotAttribution: attribution,
    });
    expect(session.success_url).toContain('/heartandangel/card/success');
    expect(session.cancel_url).toContain('checkout=cancelled');
    expect(pierrotStore.recordPierrotEventByConversationId).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conversationId,
        eventName: 'checkout_started',
        payload: expect.objectContaining({
          offer_id: 'heart_angel_postcard',
          amount_total: 2900,
        }),
      })
    );
  });

  it('drops a malformed attribution instead of passing it to Stripe', async () => {
    const response = await POST(makeRequest({ pierrotAttribution: 'hello@example.com' }));

    expect(response.status).toBe(200);

    const [session] = mockCreateSession.mock.calls[0] as [Record<string, any>];
    expect(session.metadata).not.toHaveProperty('pierrotAttribution');
  });

  it('does not open checkout for an unavailable postcard', async () => {
    const { store } = makeStore({
      postcard: {
        id: 'postcard_1',
        title: 'Heart & Angel postcard',
        price: 2900,
        available: false,
      },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await POST(makeRequest());

    expect(response.status).toBe(404);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('keeps the existing retry-safe Stripe failure handling', async () => {
    const { store, inserted, updated } = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(store);
    mockCreateSession.mockRejectedValue(new Error('Stripe unavailable'));

    const response = await POST(makeRequest());
    const json = (await response.json()) as { error?: string };

    expect(response.status).toBe(502);
    expect(json.error).toBe('Secure payment could not be started. Please try again.');
    expect(inserted).toHaveLength(1);
    expect(updated[0]).toMatchObject({ status: 'CANCELLED' });
  });

  it('rejects a request without the required delivery fields', async () => {
    const response = await POST(makeRequest({ recipientName: '' }));

    expect(response.status).toBe(400);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
