/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => '203.0.113.7'),
  RATE_LIMITS: { QUESTION_SUBSCRIPTION: { interval: 1, maxRequests: 1 } },
}));

jest.mock('@/lib/serverAuth', () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock('@/lib/question/subscriptions', () => ({
  createQuestionEmailSubscription: jest.fn(),
  createQuestionTelegramLink: jest.fn(),
  getQuestionChannelAvailability: jest.fn(),
  getQuestionSubscriptionStatusForUser: jest.fn(),
}));

const rateLimit = require('@/lib/rateLimit') as {
  checkRateLimit: jest.Mock;
};
const auth = require('@/lib/serverAuth') as { getCurrentUser: jest.Mock };
const subscriptions = require('@/lib/question/subscriptions') as {
  createQuestionEmailSubscription: jest.Mock;
  createQuestionTelegramLink: jest.Mock;
  getQuestionChannelAvailability: jest.Mock;
  getQuestionSubscriptionStatusForUser: jest.Mock;
};

const { GET, POST } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
  POST: (request: Request) => Promise<Response>;
};

const questionId = '11111111-1111-4111-8111-111111111111';

function makePost(body: unknown, headers: Record<string, string> = {}) {
  return new Request('https://www.merkurov.love/api/question/subscription', {
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
  rateLimit.checkRateLimit.mockReturnValue(null);
  auth.getCurrentUser.mockResolvedValue(null);
  subscriptions.getQuestionChannelAvailability.mockReturnValue({
    email: true,
    telegram: false,
  });
  subscriptions.getQuestionSubscriptionStatusForUser.mockResolvedValue({
    email: { state: 'none', available: true },
    telegram: { state: 'none', available: false },
  });
  subscriptions.createQuestionEmailSubscription.mockResolvedValue({
    state: 'pending',
    available: true,
  });
  subscriptions.createQuestionTelegramLink.mockResolvedValue({
    state: 'unavailable',
    available: false,
    code: 'telegram_not_configured',
  });
});

describe('Question subscription API', () => {
  it('rejects a request without any channel', async () => {
    const response = await POST(makePost({ questionId }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'no_channel' });
    expect(subscriptions.createQuestionEmailSubscription).not.toHaveBeenCalled();
  });

  it('rejects a cross-origin write', async () => {
    const response = await POST(
      makePost(
        { questionId, email: 'reader@example.com' },
        { origin: 'https://evil.example' }
      )
    );

    expect(response.status).toBe(403);
    expect(subscriptions.createQuestionEmailSubscription).not.toHaveBeenCalled();
  });

  it('creates a pending email opt-in without echoing the address', async () => {
    auth.getCurrentUser.mockResolvedValue({ id: 'user-1' });

    const response = await POST(
      makePost({ questionId, email: 'reader@example.com' })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(subscriptions.createQuestionEmailSubscription).toHaveBeenCalledWith({
      questionId,
      email: 'reader@example.com',
      userId: 'user-1',
    });
    expect(payload.email.state).toBe('pending');
    expect(JSON.stringify(payload)).not.toContain('reader@example.com');
  });

  it('returns 400 for an invalid email while keeping the channel state', async () => {
    subscriptions.createQuestionEmailSubscription.mockResolvedValueOnce({
      state: 'error',
      available: true,
      code: 'invalid_email',
    });

    const response = await POST(makePost({ questionId, email: 'broken' }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_email' });
  });

  it('returns a one-time Telegram deep link when the channel is configured', async () => {
    subscriptions.createQuestionTelegramLink.mockResolvedValueOnce({
      state: 'pending',
      available: true,
      deepLinkUrl: 'https://t.me/piero_bot?start=token',
    });

    const response = await POST(makePost({ questionId, telegram: true }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.telegram).toMatchObject({
      state: 'pending',
      deepLinkUrl: 'https://t.me/piero_bot?start=token',
    });
    expect(subscriptions.createQuestionEmailSubscription).not.toHaveBeenCalled();
  });

  it('reads only the caller own state and never identifiers', async () => {
    auth.getCurrentUser.mockResolvedValue({ id: 'user-1' });

    const response = await GET(
      new Request(
        `https://www.merkurov.love/api/question/subscription?questionId=${questionId}`
      )
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(subscriptions.getQuestionSubscriptionStatusForUser).toHaveBeenCalledWith({
      questionId,
      userId: 'user-1',
    });
    expect(JSON.stringify(payload)).not.toContain('@');
  });

  it('rejects an unknown question id before reading state', async () => {
    const response = await GET(
      new Request('https://www.merkurov.love/api/question/subscription?questionId=nope')
    );

    expect(response.status).toBe(400);
    expect(subscriptions.getQuestionSubscriptionStatusForUser).not.toHaveBeenCalled();
  });

  it('applies the subscription rate limit', async () => {
    rateLimit.checkRateLimit.mockReturnValueOnce(
      new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })
    );

    const response = await POST(
      makePost({ questionId, email: 'reader@example.com' })
    );

    expect(response.status).toBe(429);
    expect(subscriptions.createQuestionEmailSubscription).not.toHaveBeenCalled();
  });
});
