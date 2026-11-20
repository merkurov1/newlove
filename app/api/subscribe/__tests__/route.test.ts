/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/newsletter/rateLimit', () => {
  const { NextResponse } = require('next/server');
  return {
    checkNewsletterRateLimit: jest.fn(async () => ({ allowed: true })),
    newsletterRateLimitResponse: jest.fn((decision: { retryAfter: number }) =>
      NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(decision.retryAfter) } }
      )
    ),
  };
});

jest.mock('@/lib/newsletter/botProtection', () => {
  const actual = jest.requireActual('@/lib/newsletter/botProtection');
  return {
    ...actual,
    verifyTurnstileToken: jest.fn(async () => ({ ok: true, skipped: true })),
  };
});

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(),
  getCurrentUser: jest.fn(async () => null),
}));

jest.mock('@/lib/newsletter/sendSubscriptionConfirmation', () => ({
  sendSubscriptionConfirmation: jest.fn(),
}));

const serverAuth = require('@/lib/serverAuth') as {
  getServerSupabaseClient: { mockReturnValue: (value: unknown) => void };
  getCurrentUser: { mockResolvedValue: (value: unknown) => void };
};
const rateLimitModule = require('@/lib/newsletter/rateLimit') as {
  checkNewsletterRateLimit: { mockResolvedValue: (value: unknown) => void };
};
const botModule = require('@/lib/newsletter/botProtection') as {
  verifyTurnstileToken: { mockResolvedValue: (value: unknown) => void };
};
const emailModule = require('@/lib/newsletter/sendSubscriptionConfirmation') as {
  sendSubscriptionConfirmation: {
    mockResolvedValue: (value: unknown) => void;
    mock: { calls: unknown[][] };
  };
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
  deleteError?: unknown;
  eventError?: unknown;
};

function chain(awaited: unknown = { error: null }, maybeSingleData: unknown = null) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    is: () => builder,
    neq: () => builder,
    lt: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => maybeSingleData,
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(awaited).then(resolve, reject),
  };
  return builder;
}

function makeStore(options: StoreOptions = {}) {
  const inserts: Array<Record<string, unknown>> = [];
  const subscriberUpdates: Array<Record<string, unknown>> = [];
  const subscriberDeletes: string[] = [];
  const tokenRows: Array<Record<string, unknown>> = [];
  const tokenUpdates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const store = {
    from(table: string) {
      if (table === 'subscribers') {
        return {
          select: () =>
            chain(
              { error: null },
              {
                data: options.existing === undefined ? null : options.existing,
                error: options.lookupError ?? null,
              }
            ),
          insert: (row: Record<string, unknown>) => {
            inserts.push(row);
            const result = {
              data: options.insertError ? null : { id: 'sub-1' },
              error: options.insertError ?? null,
            };
            return chain(result, result);
          },
          update: (row: Record<string, unknown>) => {
            subscriberUpdates.push(row);
            return chain({ error: options.updateError ?? null });
          },
          delete: () => ({
            eq: (_column: string, value: string) => {
              subscriberDeletes.push(value);
              return chain({ error: options.deleteError ?? null });
            },
          }),
        };
      }

      if (table === 'subscriber_tokens') {
        return {
          insert: async (row: Record<string, unknown>) => {
            tokenRows.push(row);
            return { error: options.tokenError ?? null };
          },
          update: (row: Record<string, unknown>) => {
            tokenUpdates.push(row);
            return chain({ error: null });
          },
          delete: () => ({
            eq: () => chain({ error: null }),
          }),
        };
      }

      if (table === 'subscription_events') {
        return {
          upsert: async (row: Record<string, unknown>) => {
            events.push(row);
            return { error: options.eventError ?? null };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { store, inserts, subscriberUpdates, subscriberDeletes, tokenRows, tokenUpdates, events };
}

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'person@example.com',
      language: 'en',
      formStartedAt: Date.now() - 5_000,
      ...overrides,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.getServerSupabaseClient.mockReturnValue(makeStore().store);
  rateLimitModule.checkNewsletterRateLimit.mockResolvedValue({ allowed: true });
  botModule.verifyTurnstileToken.mockResolvedValue({ ok: true, skipped: false });
  emailModule.sendSubscriptionConfirmation.mockResolvedValue({
    status: 'sent',
    providerId: 'provider-1',
  });
});

describe('POST /api/subscribe bot controls', () => {
  it('creates a pending subscriber only after valid honeypot, timing and Turnstile signals', async () => {
    const fake = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await POST(
      makeRequest({
        pierrotAttribution: 'psub_11111111-1111-4111-8111-111111111111',
        turnstileToken: 'turnstile-ok',
      })
    );
    const json = (await response.json()) as { status?: string; confirmationRequired?: boolean };

    expect(response.status).toBe(200);
    expect(json.status).toBe('pending_confirmation');
    expect(json.confirmationRequired).toBe(true);
    expect(fake.inserts[0]).toMatchObject({ isActive: false, confirmedAt: null });
    expect(fake.tokenRows[0]).toMatchObject({ type: 'confirm' });
    expect(botModule.verifyTurnstileToken).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'turnstile-ok' })
    );

    const emailCall = emailModule.sendSubscriptionConfirmation.mock.calls[0][0] as {
      pierrotAttribution?: string;
    };
    expect(emailCall.pierrotAttribution).toBe('psub_11111111-1111-4111-8111-111111111111');
  });

  it('rejects a filled honeypot without writing a subscriber', async () => {
    const fake = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await POST(makeRequest({ website: 'https://spam.example' }));

    expect(response.status).toBe(400);
    expect(fake.inserts).toHaveLength(0);
    expect(fake.events[0]).toMatchObject({
      event_name: 'subscription_failed',
      payload: { reason: 'honeypot' },
    });
  });

  it('rejects a submission that is too fast', async () => {
    const fake = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await POST(makeRequest({ formStartedAt: Date.now() }));

    expect(response.status).toBe(400);
    expect(fake.inserts).toHaveLength(0);
    expect(fake.events[0]).toMatchObject({ payload: { reason: 'timing_too_fast' } });
  });

  it('rejects a submission without a server-verifiable timestamp', async () => {
    const response = await POST(makeRequest({ formStartedAt: undefined }));

    expect(response.status).toBe(400);
    expect(emailModule.sendSubscriptionConfirmation).not.toHaveBeenCalled();
  });

  it('rejects a missing Turnstile token', async () => {
    const fake = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);
    botModule.verifyTurnstileToken.mockResolvedValue({ ok: false, reason: 'missing' });

    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    expect(fake.inserts).toHaveLength(0);
    expect(fake.events[0]).toMatchObject({ payload: { reason: 'turnstile_missing' } });
  });

  it('rejects an invalid or expired Turnstile token', async () => {
    botModule.verifyTurnstileToken.mockResolvedValue({ ok: false, reason: 'invalid' });
    const invalid = await POST(makeRequest());
    expect(invalid.status).toBe(400);

    botModule.verifyTurnstileToken.mockResolvedValue({ ok: false, reason: 'expired' });
    const expired = await POST(makeRequest());
    expect(expired.status).toBe(400);
  });

  it('fails closed when the Turnstile provider is unavailable', async () => {
    botModule.verifyTurnstileToken.mockResolvedValue({
      ok: false,
      reason: 'provider_unavailable',
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(emailModule.sendSubscriptionConfirmation).not.toHaveBeenCalled();
  });

  it('returns 429 when the durable layered limiter rejects the IP or email', async () => {
    const fake = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);
    rateLimitModule.checkNewsletterRateLimit.mockResolvedValue({
      allowed: false,
      layer: 'ip',
      retryAfter: 60,
      maxRequests: 40,
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(429);
    expect(fake.inserts).toHaveLength(0);
    expect(fake.events[0]).toMatchObject({ payload: { reason: 'rate_limited_ip' } });
  });
});

describe('POST /api/subscribe lifecycle', () => {
  it('keeps Russian and English subscription audiences separate', async () => {
    const fake = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await POST(makeRequest({ language: 'ru' }));
    expect(response.status).toBe(200);

    expect(fake.inserts[0]).toMatchObject({ locale: 'ru' });
    expect(emailModule.sendSubscriptionConfirmation.mock.calls[0][0]).toMatchObject({
      locale: 'ru',
    });
  });

  it('reuses a pending subscriber without duplicating the row', async () => {
    const fake = makeStore({
      existing: { id: 'sub-1', isActive: false, confirmedAt: null, unsubscribedAt: null },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(fake.inserts).toHaveLength(0);
    expect(fake.subscriberUpdates[0]).toMatchObject({ isActive: false, confirmedAt: null });
  });

  it('reports an already confirmed subscriber without sending another confirmation', async () => {
    const fake = makeStore({
      existing: {
        id: 'sub-1',
        isActive: true,
        confirmedAt: '2026-01-01T00:00:00.000Z',
        unsubscribedAt: null,
      },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await POST(makeRequest());
    const json = (await response.json()) as { status?: string };

    expect(response.status).toBe(200);
    expect(json.status).toBe('already_confirmed');
    expect(emailModule.sendSubscriptionConfirmation).not.toHaveBeenCalled();
    expect(fake.subscriberUpdates).toHaveLength(0);
  });

  it('rejects an invalid email before touching storage', async () => {
    const response = await POST(makeRequest({ email: 'not-an-email' }));

    expect(response.status).toBe(400);
    expect(serverAuth.getServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('removes a new pending subscriber and invalidates the token when email delivery fails', async () => {
    const fake = makeStore();
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);
    emailModule.sendSubscriptionConfirmation.mockResolvedValue({
      status: 'error',
      reason: 'provider_error',
    });

    const response = await POST(makeRequest());
    const json = (await response.json()) as { error?: string };

    expect(response.status).toBe(503);
    expect(json.error).toContain('not confirmed');
    expect(fake.inserts[0]).toMatchObject({ isActive: false });
    expect(fake.subscriberDeletes).toContain('sub-1');
    expect(fake.tokenUpdates[0]).toMatchObject({ used: true });
    expect(fake.events[0]).toMatchObject({
      event_name: 'subscription_failed',
      payload: { reason: 'email_send' },
    });
  });

  it('restores a pending subscriber and never invalidates a previously confirmed subscriber on delivery failure', async () => {
    const fake = makeStore({
      existing: {
        id: 'sub-1',
        isActive: false,
        confirmedAt: null,
        unsubscribedAt: '2026-01-01T00:00:00.000Z',
        locale: 'ru',
        userId: null,
      },
    });
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);
    emailModule.sendSubscriptionConfirmation.mockResolvedValue({
      status: 'error',
      reason: 'provider_error',
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(503);
    expect(fake.subscriberDeletes).toHaveLength(0);
    expect(fake.subscriberUpdates.at(-1)).toMatchObject({
      isActive: false,
      confirmedAt: null,
      unsubscribedAt: '2026-01-01T00:00:00.000Z',
      locale: 'ru',
    });
  });

  it('returns 500 and removes the new pending row when the confirmation token cannot be stored', async () => {
    const fake = makeStore({ tokenError: { code: 'db' } });
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    expect(fake.subscriberDeletes).toContain('sub-1');
    expect(emailModule.sendSubscriptionConfirmation).not.toHaveBeenCalled();
  });

  it('returns 500 on a subscriber lookup error', async () => {
    const fake = makeStore({ lookupError: { code: 'db' } });
    serverAuth.getServerSupabaseClient.mockReturnValue(fake.store);

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
  });
});
