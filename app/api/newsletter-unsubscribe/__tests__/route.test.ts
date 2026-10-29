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

function makeStore() {
  const subscriberUpdates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  return {
    subscriberUpdates,
    events,
    store: {
      from(table: string) {
        if (table === 'subscriber_tokens') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    token,
                    subscriber_id: 'sub-1',
                    type: 'unsubscribe',
                    used: false,
                    expires_at: '2099-01-01T00:00:00.000Z',
                  },
                  error: null,
                }),
              }),
            }),
            update: () => ({
              eq: async () => ({ error: null }),
            }),
          };
        }

        if (table === 'subscribers') {
          return {
            update: (row: Record<string, unknown>) => {
              subscriberUpdates.push(row);
              return { eq: async () => ({ error: null }) };
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
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/newsletter-unsubscribe', () => {
  it('deactivates the subscriber and records an unsubscribe event', async () => {
    const fake = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await GET(
      new Request(`http://localhost/api/newsletter-unsubscribe?token=${token}`)
    );

    expect(response.status).toBe(200);
    expect(fake.subscriberUpdates[0]).toMatchObject({ isActive: false });
    expect(fake.events[0]).toMatchObject({ event_name: 'unsubscribe' });
  });
});
