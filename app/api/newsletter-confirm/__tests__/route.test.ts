/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
  RATE_LIMITS: { NEWSLETTER: { interval: 1000, maxRequests: 5, keyPrefix: 'test' } },
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

const token = 'abcdef1234567890abcdef1234567890';

type Options = {
  tokenRow?: Record<string, unknown> | null;
  tokenLookupError?: unknown;
  subscriberError?: unknown;
  tokenUpdateError?: unknown;
};

function makeStore(options: Options = {}) {
  const subscriberUpdates: Array<Record<string, unknown>> = [];
  const tokenUpdates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const store = {
    from(table: string) {
      if (table === 'subscriber_tokens') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  options.tokenRow === undefined
                    ? {
                        token,
                        subscriber_id: 'sub-1',
                        type: 'confirm',
                        used: false,
                        expires_at: '2099-01-01T00:00:00.000Z',
                      }
                    : options.tokenRow,
                error: options.tokenLookupError ?? null,
              }),
            }),
          }),
          update: (row: Record<string, unknown>) => {
            tokenUpdates.push(row);
            return {
              eq: async () => ({ error: options.tokenUpdateError ?? null }),
            };
          },
        };
      }

      if (table === 'subscribers') {
        return {
          update: (row: Record<string, unknown>) => {
            subscriberUpdates.push(row);
            return {
              eq: async () => ({ error: options.subscriberError ?? null }),
            };
          },
        };
      }

      if (table === 'subscription_events') {
        return {
          upsert: async (row: Record<string, unknown>) => {
            events.push(row);
            return { error: null };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { store, subscriberUpdates, tokenUpdates, events };
}

function makeRequest(query = `token=${token}`): Request {
  return new Request(`http://localhost/api/newsletter-confirm?${query}`);
}

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.getServerSupabaseClient.mockReturnValue(makeStore().store);
});

describe('GET /api/newsletter-confirm', () => {
  it('activates the subscriber only when a valid confirmation token is opened', async () => {
    const { store, subscriberUpdates, tokenUpdates, events } = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await GET(makeRequest(`token=${token}&lang=en`));

    expect(response.status).toBe(200);
    expect(subscriberUpdates[0]).toMatchObject({ isActive: true });
    expect(tokenUpdates[0]).toMatchObject({ used: true });
    expect(events[0]).toMatchObject({ event_name: 'subscription_confirmed' });
    expect(JSON.stringify(events[0])).not.toContain('person@example.com');
  });

  it('does not confirm twice with the same token', async () => {
    const { store, subscriberUpdates } = makeStore({
      tokenRow: {
        token,
        subscriber_id: 'sub-1',
        type: 'confirm',
        used: true,
        expires_at: '2099-01-01T00:00:00.000Z',
      },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await GET(makeRequest());

    expect(response.status).toBe(404);
    expect(subscriberUpdates).toHaveLength(0);
  });

  it('rejects an expired token', async () => {
    const { store, subscriberUpdates } = makeStore({
      tokenRow: {
        token,
        subscriber_id: 'sub-1',
        type: 'confirm',
        used: false,
        expires_at: '2020-01-01T00:00:00.000Z',
      },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await GET(makeRequest());

    expect(response.status).toBe(410);
    expect(subscriberUpdates).toHaveLength(0);
  });

  it('does not mark the token used when the subscriber update fails', async () => {
    const { store, tokenUpdates } = makeStore({ subscriberError: { code: 'db' } });
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    expect(tokenUpdates).toHaveLength(0);
  });
});
