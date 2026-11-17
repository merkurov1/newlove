/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => '203.0.113.7'),
  RATE_LIMITS: { QUESTION_SUBSCRIPTION: { interval: 1, maxRequests: 1 } },
}));

jest.mock('@/lib/serverAuth', () => ({
  requireUser: jest.fn(),
}));

jest.mock('@/lib/question/subscriptions', () => ({
  disableQuestionChannel: jest.fn(),
}));

const auth = require('@/lib/serverAuth') as { requireUser: jest.Mock };
const subscriptions = require('@/lib/question/subscriptions') as {
  disableQuestionChannel: jest.Mock;
};

const { POST } = require('../route') as {
  POST: (request: Request) => Promise<Response>;
};

const questionId = '11111111-1111-4111-8111-111111111111';

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://www.merkurov.love/api/question/subscription/disable', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'www.merkurov.love',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.requireUser.mockResolvedValue({ id: 'user-1', role: 'USER', profile: {} });
  subscriptions.disableQuestionChannel.mockResolvedValue('disabled');
});

describe('POST /api/question/subscription/disable', () => {
  it('rejects an unauthenticated request', async () => {
    auth.requireUser.mockRejectedValueOnce(new Error('Unauthorized'));

    const response = await POST(makeRequest({ questionId, channel: 'email' }));

    expect(response.status).toBe(401);
    expect(subscriptions.disableQuestionChannel).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin request', async () => {
    const response = await POST(
      makeRequest(
        { questionId, channel: 'email' },
        { origin: 'https://evil.example' }
      )
    );

    expect(response.status).toBe(403);
  });

  it('disables the channel scoped to the authenticated user', async () => {
    const response = await POST(makeRequest({ questionId, channel: 'telegram' }));

    expect(response.status).toBe(200);
    expect(subscriptions.disableQuestionChannel).toHaveBeenCalledWith({
      questionId,
      userId: 'user-1',
      channel: 'telegram',
    });
    expect(await response.json()).toEqual({ ok: true, channel: 'telegram' });
  });

  it('returns 404 when the user has no such subscription', async () => {
    subscriptions.disableQuestionChannel.mockResolvedValueOnce('not_found');

    const response = await POST(makeRequest({ questionId, channel: 'email' }));

    expect(response.status).toBe(404);
  });

  it('accepts an unsubscribe-all request', async () => {
    const response = await POST(makeRequest({ questionId, channel: 'all' }));

    expect(response.status).toBe(200);
    expect(subscriptions.disableQuestionChannel).toHaveBeenCalledWith({
      questionId,
      userId: 'user-1',
      channel: 'all',
    });
  });

  it('rejects an unsupported channel', async () => {
    const response = await POST(makeRequest({ questionId, channel: 'sms' }));

    expect(response.status).toBe(400);
    expect(subscriptions.disableQuestionChannel).not.toHaveBeenCalled();
  });
});
