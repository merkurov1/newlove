/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
};

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
  RATE_LIMITS: { NEWSLETTER: { interval: 1000, maxRequests: 5, keyPrefix: 'test' } },
}));

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(),
  getCurrentUser: jest.fn(async () => null),
}));

jest.mock('@/lib/newsletter/sendSubscriptionConfirmation', () => ({
  sendSubscriptionConfirmation: jest.fn(),
}));

const serverAuth = require('@/lib/serverAuth') as {
  getServerSupabaseClient: { mockReturnValue: (value: unknown) => void };
  getCurrentUser: MockFn;
};
const emailModule = require('@/lib/newsletter/sendSubscriptionConfirmation') as {
  sendSubscriptionConfirmation: MockFn;
};
const { POST } = require('../route') as {
  POST: (request: Request) => Promise<Response>;
};

type StoreOptions = {
  existing?: Record<string, unknown> | null;
  lookupError?: unknown;
  insertError?: unknown;
  updateError?: unknown;
  tokenError?: unknown;
};

function makeStore(options: StoreOptions = {}) {
  const subscriberRows: Array<Record<string, unknown>> = [];
  const inserts: Array<Record<string, unknown>> = [];
  const tokenRows: Array<Record<string, unknown>> = [];

  const store = {
    from(table: string) {
      if (table === 'subscribers') {
        return {
          select: () => ({
            ilike: () => ({
              maybeSingle: async () => ({
                data: options.existing === undefined ? null : options.existing,
                error: options.lookupError ?? null,
              }),
            }),
          }),
          insert: (row: Record<string, unknown>) => {
            inserts.push(row);
            return {
              select: () => ({
                maybeSingle: async () => ({
                  data: options.insertError ? null : { id: 'sub-1' },
                  error: options.insertError ?? null,
                }),
              }),
            };
          },
          update: (row: Record<string, unknown>) => {
            subscriberRows.push(row);
            return {
              eq: async () => ({ error: options.updateError ?? null }),
            };
          },
        };
      }

      if (table === 'subscriber_tokens') {
        return {
          update: () => ({
            eq: () => ({
              eq: () => ({
                eq: async () => ({ error: null }),
              }),
            }),
          }),
          insert: async (row: Record<string, unknown>) => {
            tokenRows.push(row);
            return { error: options.tokenError ?? null };
          },
        };
      }

      if (table === 'subscription_events') {
        return {
          upsert: async () => ({ error: null }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { store, subscriberRows, inserts, tokenRows };
}

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'person@example.com', language: 'en', ...overrides }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.getServerSupabaseClient.mockReturnValue(makeStore().store);
  emailModule.sendSubscriptionConfirmation.mockResolvedValue({
    status: 'sent',
    providerId: 'provider-1',
  });
});

describe('POST /api/subscribe', () => {
  it('stores a pending subscriber and never claims confirmation before email confirmation', async () => {
    const { store, inserts, tokenRows } = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await POST(
      makeRequest({ pierrotAttribution: 'psub_11111111-1111-4111-8111-111111111111' })
    );
    const json = (await response.json()) as { status?: string; confirmationRequired?: boolean };

    expect(response.status).toBe(200);
    expect(json.status).toBe('pending_confirmation');
    expect(json.confirmationRequired).toBe(true);
    expect(inserts[0]).toMatchObject({ isActive: false, confirmedAt: null });
    expect(tokenRows[0]).toMatchObject({ type: 'confirm' });

    const emailCall = emailModule.sendSubscriptionConfirmation.mock.calls[0][0] as {
      pierrotAttribution?: string;
    };
    expect(emailCall.pierrotAttribution).toBe('psub_11111111-1111-4111-8111-111111111111');
  });

  it('reuses a pending subscriber without duplicating the row', async () => {
    const { store, inserts, subscriberRows } = makeStore({
      existing: { id: 'sub-1', isActive: false, confirmedAt: null },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(inserts).toHaveLength(0);
    expect(subscriberRows[0]).toMatchObject({ isActive: false, confirmedAt: null });
  });

  it('reports an already confirmed subscriber without sending another confirmation', async () => {
    const { store } = makeStore({
      existing: { id: 'sub-1', isActive: true, confirmedAt: '2026-01-01T00:00:00.000Z' },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await POST(makeRequest());
    const json = (await response.json()) as { status?: string };

    expect(response.status).toBe(200);
    expect(json.status).toBe('already_confirmed');
    expect(emailModule.sendSubscriptionConfirmation).not.toHaveBeenCalled();
  });

  it('rejects an invalid email before touching storage', async () => {
    const response = await POST(makeRequest({ email: 'not-an-email' }));

    expect(response.status).toBe(400);
    expect(serverAuth.getServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('does not report success when the confirmation email fails', async () => {
    emailModule.sendSubscriptionConfirmation.mockResolvedValue({
      status: 'error',
      reason: 'provider_error',
    });

    const response = await POST(makeRequest());
    const json = (await response.json()) as { error?: string };

    expect(response.status).toBe(503);
    expect(json.error).toContain('not confirmed');
  });

  it('returns 500 when the confirmation token cannot be stored', async () => {
    const { store } = makeStore({ tokenError: { code: 'db' } });
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    expect(emailModule.sendSubscriptionConfirmation).not.toHaveBeenCalled();
  });

  it('returns 500 on a subscriber lookup error', async () => {
    const { store } = makeStore({ lookupError: { code: 'db' } });
    serverAuth.getServerSupabaseClient.mockReturnValue(store);

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
  });
});
