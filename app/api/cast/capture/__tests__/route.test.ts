/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const maybeSingle = jest.fn();
const updateIs = jest.fn();
const updateEq = jest.fn();
const updateSelect = jest.fn();
const sendCastResultEmail = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/cast/sendCastResultEmail', () => ({
  sendCastResultEmail: (...args: unknown[]) => sendCastResultEmail(...args),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: () => null,
  getClientIp: () => '127.0.0.1',
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ maybeSingle })),
      })),
      update: jest.fn(() => {
        const builder = {
          eq: (...args: unknown[]) => {
            updateEq(...args);
            return builder;
          },
          is: (...args: unknown[]) => {
            updateIs(...args);
            return builder;
          },
          select: (...args: unknown[]) => {
            updateSelect(...args);
            return Promise.resolve({
              data: [{ id: 'cast-record-1' }],
              error: null,
            });
          },
          then: (
            resolve: (value: { error: null }) => unknown,
            reject?: (reason: unknown) => unknown
          ) => Promise.resolve({ error: null }).then(resolve, reject),
        };

        return builder;
      }),
    })),
  })),
}));

process.env.CAST_CAPTURE_SECRET = 'cast-route-test-secret';

const { createCastCaptureToken } = require('@/lib/cast/captureToken') as {
  createCastCaptureToken: (recordId: string, createdAt: string) => string;
};

const { POST } = require('@/app/api/cast/capture/route') as {
  POST: (request: Request) => Promise<Response>;
};

const CREATED_AT = '2026-11-24T08:00:00.000Z';
const RECORD_ID = 'cast-record-1';

const ANALYSIS = {
  agency_index: 61,
  archetype: 'STONE',
  executive_summary: 'The answers suggest a guarded but deliberate stance.',
  strategic_directive: 'Name one small next step.',
};

function request(body: Record<string, unknown>) {
  return new Request('http://localhost/api/cast/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  maybeSingle.mockResolvedValue({
    data: {
      id: RECORD_ID,
      created_at: CREATED_AT,
      archetype: 'STONE',
      language: 'en',
      analysis: ANALYSIS,
      capture_consumed_at: null,
    },
    error: null,
  });
  updateEq.mockReturnValue(undefined);
  updateIs.mockReturnValue(undefined);
  updateSelect.mockReturnValue(undefined);
  sendCastResultEmail.mockResolvedValue({
    status: 'sent',
    providerId: 'email-1',
  });
  mockRpc.mockResolvedValue({
    data: [
      {
        allowed: true,
        remaining: 5,
        reset_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ],
    error: null,
  });
});

describe('POST /api/cast/capture authorization contract', () => {
  it('rejects a request without the capture token', async () => {
    const response = await POST(
      request({ recordId: RECORD_ID, email: 'reader@example.com' })
    );

    expect(response.status).toBe(400);
    expect(updateEq).not.toHaveBeenCalled();
  });

  it('rejects a token bound to another record', async () => {
    const token = createCastCaptureToken('another-record', CREATED_AT);

    const response = await POST(
      request({
        recordId: RECORD_ID,
        captureToken: token,
        email: 'reader@example.com',
      })
    );

    expect(response.status).toBe(403);
    expect(updateEq).not.toHaveBeenCalled();
  });

  it('rejects an expired token', async () => {
    const expired = createCastCaptureToken(
      RECORD_ID,
      CREATED_AT,
      Date.now() - 30 * 24 * 60 * 60 * 1000
    );

    const response = await POST(
      request({
        recordId: RECORD_ID,
        captureToken: expired,
        email: 'reader@example.com',
      })
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(payload.code).toBe('capture_token_expired');
    expect(updateEq).not.toHaveBeenCalled();
  });

  it('refuses a record whose token was already consumed', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: RECORD_ID,
        created_at: CREATED_AT,
        archetype: 'STONE',
        language: 'en',
        analysis: ANALYSIS,
        capture_consumed_at: '2026-11-25T10:00:00.000Z',
      },
      error: null,
    });

    const response = await POST(
      request({
        recordId: RECORD_ID,
        captureToken: createCastCaptureToken(RECORD_ID, CREATED_AT),
        email: 'reader@example.com',
      })
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(payload.code).toBe('capture_already_consumed');
  });

  it('accepts the exact token, consumes it once and sends the email', async () => {
    const response = await POST(
      request({
        recordId: RECORD_ID,
        captureToken: createCastCaptureToken(RECORD_ID, CREATED_AT),
        email: 'reader@example.com',
      })
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      success: true,
      emailDelivered: true,
    });
    expect(updateEq).toHaveBeenCalledWith('id', RECORD_ID);
    expect(updateIs).toHaveBeenCalledWith('capture_consumed_at', null);
    expect(sendCastResultEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'reader@example.com',
        archetype: 'STONE',
      })
    );
  });

  it('does not claim delivery when the email provider is not configured', async () => {
    sendCastResultEmail.mockResolvedValue({ status: 'not_configured' });

    const response = await POST(
      request({
        recordId: RECORD_ID,
        captureToken: createCastCaptureToken(RECORD_ID, CREATED_AT),
        email: 'reader@example.com',
      })
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      success: true,
      emailDelivered: false,
      code: 'email_delivery_not_configured',
    });
  });

  it('reports a provider failure without pretending the copy arrived', async () => {
    sendCastResultEmail.mockResolvedValue({
      status: 'error',
      reason: 'provider_error',
    });

    const response = await POST(
      request({
        recordId: RECORD_ID,
        captureToken: createCastCaptureToken(RECORD_ID, CREATED_AT),
        email: 'reader@example.com',
      })
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(payload).toMatchObject({
      success: true,
      emailDelivered: false,
      code: 'email_delivery_failed',
    });
    // The email must never be echoed back.
    expect(JSON.stringify(payload)).not.toContain('reader@example.com');
  });

  it('rejects the capture when the shared rate limit is exhausted', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          allowed: false,
          remaining: 0,
          reset_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
      error: null,
    });

    const response = await POST(
      request({
        recordId: RECORD_ID,
        captureToken: createCastCaptureToken(RECORD_ID, CREATED_AT),
        email: 'reader@example.com',
      })
    );

    expect(response.status).toBe(429);
    expect(updateEq).not.toHaveBeenCalled();
  });
});
