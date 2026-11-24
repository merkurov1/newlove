/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const maybeSingle = jest.fn();
const updateEq = jest.fn();

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: () => null,
  getClientIp: () => '127.0.0.1',
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({ maybeSingle })),
      })),
      update: jest.fn(() => ({
        eq: updateEq,
      })),
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
    data: { id: RECORD_ID, created_at: CREATED_AT },
    error: null,
  });
  updateEq.mockResolvedValue({ error: null });
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

  it('rejects a forged token for the requested record', async () => {
    const response = await POST(
      request({
        recordId: RECORD_ID,
        captureToken: 'a'.repeat(64),
        email: 'reader@example.com',
      })
    );

    expect(response.status).toBe(403);
    expect(updateEq).not.toHaveBeenCalled();
  });

  it('accepts the exact HMAC token issued for the record', async () => {
    const token = createCastCaptureToken(RECORD_ID, CREATED_AT);

    const response = await POST(
      request({
        recordId: RECORD_ID,
        captureToken: token,
        email: 'reader@example.com',
      })
    );

    expect(response.status).toBe(200);
    expect(updateEq).toHaveBeenCalledWith('id', RECORD_ID);
  });
});
