/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/lib/serverAuth', () => ({
  getCurrentUser: jest.fn(async () => null),
}));

jest.mock('@/lib/rateLimit', () => ({
  getClientIp: jest.fn(() => 'test-client'),
}));

jest.mock('@/lib/pierrot/rateLimit', () => ({
  checkPierrotRateLimit: jest.fn(async () => null),
}));

jest.mock('@/lib/pierrot/serverStore', () => {
  const actual = jest.requireActual('@/lib/pierrot/serverStore') as Record<string, unknown>;

  return {
    ...actual,
    createPierrotStore: jest.fn(() => ({ mocked: true })),
    ensurePierrotConversation: jest.fn(async () => undefined),
    recordPierrotEvent: jest.fn(async () => true),
    markPierrotConversationEnded: jest.fn(async () => undefined),
    persistenceFailure: jest.fn(),
  };
});

const serverAuth = require('@/lib/serverAuth') as {
  getCurrentUser: {
    mockResolvedValue: (value: unknown) => void;
    mockResolvedValueOnce: (value: unknown) => void;
  };
};
const storeModule = require('@/lib/pierrot/serverStore') as {
  ensurePierrotConversation: { mock: { calls: unknown[][] } };
};
const { POST } = require('../route') as {
  POST: (request: Request) => Promise<Response>;
};

const conversationId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const visitorId = '33333333-3333-4333-8333-333333333333';

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/pierrot/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      conversationId,
      sessionId,
      visitorId,
      eventName: 'action_clicked',
      eventKey: 'action-1',
      payload: { action_kind: 'navigate', section_id: 'lobby' },
      consent: { state: 'granted', version: '2026-10-29' },
      context: { pathname: '/lobby' },
      ...overrides,
    }),
  });
}

function ensureIdentity() {
  const call = storeModule.ensurePierrotConversation.mock.calls[0]?.[1] as
    { identity?: Record<string, unknown> } | undefined;

  return call?.identity;
}

beforeEach(() => {
  jest.clearAllMocks();
  serverAuth.getCurrentUser.mockResolvedValue(null);
});

describe('Pierrot event identity', () => {
  it('attributes an anonymous consented event to a visitor pseudonym', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(204);
    expect(ensureIdentity()).toMatchObject({
      type: 'visitor',
      visitorId,
      userId: null,
    });
  });

  it('attributes an authenticated admin event to owner', async () => {
    serverAuth.getCurrentUser.mockResolvedValueOnce({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      role: 'ADMIN',
      profile: { role: 'ADMIN' },
    });

    const response = await POST(
      makeRequest({ is_owner: true, identity_type: 'visitor', user_id: 'fake' })
    );

    expect(response.status).toBe(204);
    expect(ensureIdentity()).toMatchObject({
      type: 'owner',
      userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      source: 'supabase_session',
    });
  });

  it('keeps an unconsented event out of storage', async () => {
    const response = await POST(
      makeRequest({ consent: { state: 'denied', version: '2026-10-29' } })
    );

    expect(response.status).toBe(204);
    expect(storeModule.ensurePierrotConversation).not.toHaveBeenCalled();
  });
});
