/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockRetrieve = jest.fn();

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

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({})),
}));

jest.mock('@/lib/tributes/paymentConfirmation', () => ({
  confirmTributeCheckoutSession: jest.fn(),
}));

const confirmation = require('@/lib/tributes/paymentConfirmation') as {
  confirmTributeCheckoutSession: jest.Mock;
};

process.env.STRIPE_SECRET_KEY = 'sk_test_verify';

const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

function makeRequest(sessionId = 'cs_test_1234567890') {
  return new Request(
    `http://localhost/api/tribute/verify?session_id=${encodeURIComponent(sessionId)}`
  );
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_1234567890',
    status: 'complete',
    payment_status: 'paid',
    amount_total: 2000,
    currency: 'usd',
    metadata: { type: 'tribute_v1' },
    customer_details: { email: 'donor@example.com' },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  confirmation.confirmTributeCheckoutSession.mockResolvedValue({
    status: 'confirmed',
    sessionId: 'cs_test_1234567890',
  });
});

describe('GET /api/tribute/verify', () => {
  it('rejects a missing or malformed session id without calling Stripe', async () => {
    const response = await GET(
      new Request('http://localhost/api/tribute/verify')
    );

    expect(response.status).toBe(400);
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it('confirms only a paid Tribute session and returns no personal data', async () => {
    mockRetrieve.mockResolvedValue(session());

    const response = await GET(makeRequest());
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'confirmed',
      amount: 20,
      currency: 'usd',
    });
    expect(JSON.stringify(payload)).not.toContain('donor@example.com');
    expect(confirmation.confirmTributeCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it('does not treat an unpaid success return as a donation', async () => {
    mockRetrieve.mockResolvedValue(
      session({ payment_status: 'unpaid', status: 'open' })
    );

    const response = await GET(makeRequest());
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.status).toBe('processing');
    expect(confirmation.confirmTributeCheckoutSession).not.toHaveBeenCalled();
  });

  it('reports an expired session as cancelled', async () => {
    mockRetrieve.mockResolvedValue(
      session({ payment_status: 'unpaid', status: 'expired' })
    );

    const response = await GET(makeRequest());
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.status).toBe('cancelled');
    expect(confirmation.confirmTributeCheckoutSession).not.toHaveBeenCalled();
  });

  it('never confirms a session that is not a Tribute', async () => {
    mockRetrieve.mockResolvedValue(
      session({ metadata: { type: 'postcard_v1' } })
    );

    const response = await GET(makeRequest());

    expect(response.status).toBe(404);
    expect(confirmation.confirmTributeCheckoutSession).not.toHaveBeenCalled();
  });

  it('keeps a transient Stripe lookup failure in processing so the visitor can retry', async () => {
    mockRetrieve.mockRejectedValue({ statusCode: 503, code: 'api_error' });

    const response = await GET(makeRequest());
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(payload.status).toBe('processing');
    expect(confirmation.confirmTributeCheckoutSession).not.toHaveBeenCalled();
  });

  it('keeps a paid but unrecorded session in processing instead of lying', async () => {
    mockRetrieve.mockResolvedValue(session());
    confirmation.confirmTributeCheckoutSession.mockResolvedValue({
      status: 'rejected',
      code: 'insert_failed',
      sessionId: 'cs_test_1234567890',
    });

    const response = await GET(makeRequest());
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: 'processing',
      recorded: false,
      amount: 20,
    });
  });
});
