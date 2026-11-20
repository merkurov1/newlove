/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/newsletter/rateLimit', () => {
  const { NextResponse } = require('next/server');
  return {
    checkNewsletterIpRateLimit: jest.fn(async () => ({ allowed: true })),
    newsletterRateLimitResponse: jest.fn((decision: { retryAfter: number }) =>
      NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(decision.retryAfter) } }
      )
    ),
  };
});

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
  subscriber?: Record<string, unknown> | null;
  subscriberLookupError?: unknown;
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
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data:
                  options.subscriber === undefined
                    ? { id: 'sub-1', isActive: true, confirmedAt: '2026-01-01T00:00:00.000Z' }
                    : options.subscriber,
                error: options.subscriberLookupError ?? null,
              }),
            }),
          }),
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
    const fake = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await GET(makeRequest(`token=${token}&lang=en`));

    expect(response.status).toBe(200);
    expect(fake.subscriberUpdates[0]).toMatchObject({ isActive: true });
    expect(fake.tokenUpdates[0]).toMatchObject({ used: true });
    expect(fake.events[0]).toMatchObject({ event_name: 'subscription_confirmed' });
    expect(JSON.stringify(fake.events[0])).not.toContain('person@example.com');
  });

  it('treats a repeated or scanner-opened link as idempotent for a confirmed subscriber', async () => {
    const fake = makeStore({
      tokenRow: {
        token,
        subscriber_id: 'sub-1',
        type: 'confirm',
        used: true,
        expires_at: '2099-01-01T00:00:00.000Z',
      },
      subscriber: {
        id: 'sub-1',
        isActive: true,
        confirmedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await GET(makeRequest());
    const json = (await response.json()) as { alreadyConfirmed?: boolean };

    expect(response.status).toBe(200);
    expect(json.alreadyConfirmed).toBe(true);
    expect(fake.subscriberUpdates).toHaveLength(0);
    expect(fake.events).toHaveLength(0);
  });

  it('does not confirm twice with the same token when the subscriber is not confirmed', async () => {
    const fake = makeStore({
      tokenRow: {
        token,
        subscriber_id: 'sub-1',
        type: 'confirm',
        used: true,
        expires_at: '2099-01-01T00:00:00.000Z',
      },
      subscriber: { id: 'sub-1', isActive: false, confirmedAt: null },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await GET(makeRequest());

    expect(response.status).toBe(404);
    expect(fake.subscriberUpdates).toHaveLength(0);
  });

  it('rejects an expired token', async () => {
    const fake = makeStore({
      tokenRow: {
        token,
        subscriber_id: 'sub-1',
        type: 'confirm',
        used: false,
        expires_at: '2020-01-01T00:00:00.000Z',
      },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await GET(makeRequest());

    expect(response.status).toBe(410);
    expect(fake.subscriberUpdates).toHaveLength(0);
  });

  it('does not mark the token used when the subscriber update fails', async () => {
    const fake = makeStore({ subscriberError: { code: 'db' } });
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    expect(fake.tokenUpdates).toHaveLength(0);
  });
});
