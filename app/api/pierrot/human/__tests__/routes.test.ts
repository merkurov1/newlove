/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockReturnValue: (value: unknown) => void;
  mockResolvedValue: (value: unknown) => void;
  mockResolvedValueOnce: (value: unknown) => void;
  mockReset: () => void;
};

function asMock(value: unknown): MockFn {
  return value as unknown as MockFn;
}

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => '127.0.0.1'),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  createPierrotStore: jest.fn(() => ({ mocked: true })),
}));

jest.mock('@/lib/pierrot/humanPresenceTelegram', () => ({
  sendVisitorMessageToOwner: jest.fn(),
  editHumanRequestNotification: jest.fn(),
  sendOwnerConfirmation: jest.fn(),
  closedNotificationText: jest.fn(() => 'closed'),
  declinedNotificationText: jest.fn(() => 'declined'),
}));

jest.mock('@/lib/pierrot/humanPresence', () => {
  const actual = jest.requireActual('@/lib/pierrot/humanPresence') as Record<
    string,
    unknown
  >;

  return {
    ...actual,
    getHumanPresenceByToken: jest.fn(),
    getHumanPresenceForConversation: jest.fn(),
    getHumanPresenceByRequestId: jest.fn(),
    buildHumanStateResponse: jest.fn(),
    appendHumanMessage: jest.fn(),
    getHumanMessageLink: jest.fn(),
    updateHumanMessageLink: jest.fn(),
    recordHumanEvent: jest.fn(),
    declineHumanRequest: jest.fn(),
    closeHumanSession: jest.fn(),
  };
});

const human = require('@/lib/pierrot/humanPresence') as {
  getHumanPresenceByToken: unknown;
  getHumanPresenceForConversation: unknown;
  getHumanPresenceByRequestId: unknown;
  buildHumanStateResponse: unknown;
  appendHumanMessage: unknown;
  getHumanMessageLink: unknown;
  updateHumanMessageLink: unknown;
  recordHumanEvent: unknown;
  declineHumanRequest: unknown;
  closeHumanSession: unknown;
};
const telegram = require('@/lib/pierrot/humanPresenceTelegram') as {
  sendVisitorMessageToOwner: unknown;
  editHumanRequestNotification: unknown;
  sendOwnerConfirmation: unknown;
};
const { POST: statePost } = require('../state/route') as {
  POST: (request: Request) => Promise<Response>;
};
const { POST: messagePost } = require('../message/route') as {
  POST: (request: Request) => Promise<Response>;
};
const { POST: actionPost } = require('../action/route') as {
  POST: (request: Request) => Promise<Response>;
};

const conversationId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const messageId = '44444444-4444-4444-8444-444444444444';

function makeRequest(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function record(status: 'pending' | 'active' = 'active') {
  return {
    request: {
      id: requestId,
      conversation_id: conversationId,
      status,
      access_token_hash: 'a'.repeat(64),
      visitor_label: '#A821',
      start_page: '/lobby',
      context_summary: null,
      language: 'ru' as const,
      resolved_by: null,
      telegram_chat_id: 123456789,
      telegram_message_id: 77,
      telegram_status_message_id: 77,
      created_at: '2026-10-30T10:00:00.000Z',
      updated_at: '2026-10-30T10:00:00.000Z',
      expires_at: '2026-10-30T10:20:00.000Z',
      accepted_at: status === 'active' ? '2026-10-30T10:01:00.000Z' : null,
      declined_at: null,
      closed_at: null,
      expired_at: null,
    },
    session:
      status === 'active'
        ? {
            id: '55555555-5555-4555-8555-555555555555',
            request_id: requestId,
            conversation_id: conversationId,
            owner_telegram_id: 123456789,
            status: 'active' as const,
            opened_at: '2026-10-30T10:01:00.000Z',
            closed_at: null,
            closed_by: null,
          }
        : null,
    conversationSessionId: sessionId,
  };
}

function statePayload(overrides: Record<string, unknown> = {}) {
  return {
    request: {
      requestId,
      status: 'active',
      visitorLabel: '#A821',
      startPage: '/lobby',
      language: 'ru',
      createdAt: '2026-10-30T10:00:00.000Z',
      expiresAt: '2026-10-30T10:20:00.000Z',
      acceptedAt: '2026-10-30T10:01:00.000Z',
      closedAt: null,
      resolvedBy: null,
    },
    session: null,
    conversationId,
    sessionId,
    messages: [],
    serverTime: '2026-10-30T10:02:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  asMock(human.getHumanPresenceByToken).mockResolvedValue(null);
  asMock(human.getHumanPresenceForConversation).mockResolvedValue(null);
  asMock(human.getHumanPresenceByRequestId).mockResolvedValue(null);
  asMock(human.buildHumanStateResponse).mockResolvedValue(statePayload());
  asMock(human.recordHumanEvent).mockResolvedValue(undefined);
  asMock(human.updateHumanMessageLink).mockResolvedValue(undefined);
  asMock(telegram.sendVisitorMessageToOwner).mockResolvedValue({
    messageId: 88,
    chatId: 123456789,
  });
  asMock(telegram.editHumanRequestNotification).mockResolvedValue(true);
  asMock(telegram.sendOwnerConfirmation).mockResolvedValue({
    messageId: 89,
    chatId: 123456789,
  });
});

describe('POST /api/pierrot/human/state', () => {
  it('rejects requests without credentials', async () => {
    const response = await statePost(
      makeRequest('/api/pierrot/human/state', {})
    );

    expect(response.status).toBe(400);
  });

  it('rejects an unknown recovery token without revealing data', async () => {
    const response = await statePost(
      makeRequest('/api/pierrot/human/state', {
        token: 'A'.repeat(43),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({ error: 'Not found.' });
  });

  it('returns state only for an authenticated token', async () => {
    asMock(human.getHumanPresenceByToken).mockResolvedValue(record('active'));

    const response = await statePost(
      makeRequest('/api/pierrot/human/state', {
        token: 'A'.repeat(43),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.request.requestId).toBe(requestId);
    expect(JSON.stringify(json)).not.toContain('a'.repeat(64));
    expect(JSON.stringify(json)).not.toContain('123456789');
  });

  it('does not expose a conversation when the session pair is wrong', async () => {
    const response = await statePost(
      makeRequest('/api/pierrot/human/state', {
        conversationId,
        sessionId,
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.request).toBeNull();
    expect(json.messages).toEqual([]);
  });
});

describe('POST /api/pierrot/human/message', () => {
  it('rejects a message when the caller does not own the request', async () => {
    const response = await messagePost(
      makeRequest('/api/pierrot/human/message', {
        conversationId,
        sessionId,
        messageId,
        content: 'hello',
      })
    );

    expect(response.status).toBe(403);
  });

  it('rejects a message after closure', async () => {
    asMock(human.getHumanPresenceForConversation).mockResolvedValue(record('pending'));

    const response = await messagePost(
      makeRequest('/api/pierrot/human/message', {
        conversationId,
        sessionId,
        messageId,
        content: 'hello',
      })
    );

    expect(response.status).toBe(409);
  });

  it('persists and relays one visitor message atomically', async () => {
    asMock(human.getHumanPresenceForConversation).mockResolvedValue(record('active'));
    asMock(human.appendHumanMessage).mockResolvedValue({
      sequence: 5,
      content: 'hello',
      inserted: true,
      conversationId,
      sessionId,
      alreadyLinked: false,
    });

    const response = await messagePost(
      makeRequest('/api/pierrot/human/message', {
        conversationId,
        sessionId,
        messageId,
        content: 'hello',
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.delivery).toBe('sent');
    expect(human.appendHumanMessage).toHaveBeenCalledTimes(1);
    expect(telegram.sendVisitorMessageToOwner).toHaveBeenCalledTimes(1);
    expect(human.updateHumanMessageLink).toHaveBeenCalledWith(
      expect.anything(),
      messageId,
      expect.objectContaining({ status: 'sent' })
    );
  });

  it('does not send a redelivered message to Telegram twice', async () => {
    asMock(human.getHumanPresenceForConversation).mockResolvedValue(record('active'));
    asMock(human.appendHumanMessage).mockResolvedValue({
      sequence: 5,
      content: 'hello',
      inserted: false,
      conversationId,
      sessionId,
      alreadyLinked: true,
    });
    asMock(human.getHumanMessageLink).mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      request_id: requestId,
      session_id: '55555555-5555-4555-8555-555555555555',
      conversation_id: conversationId,
      message_id: messageId,
      direction: 'visitor_to_telegram',
      telegram_chat_id: 123456789,
      telegram_message_id: 88,
      delivery_status: 'sent',
    });

    const response = await messagePost(
      makeRequest('/api/pierrot/human/message', {
        conversationId,
        sessionId,
        messageId,
        content: 'hello',
      })
    );

    expect(response.status).toBe(200);
    expect(telegram.sendVisitorMessageToOwner).not.toHaveBeenCalled();
    expect(human.updateHumanMessageLink).not.toHaveBeenCalled();
  });

  it('rejects oversized messages', async () => {
    const response = await messagePost(
      makeRequest('/api/pierrot/human/message', {
        conversationId,
        sessionId,
        messageId,
        content: 'x'.repeat(4001),
      })
    );

    expect(response.status).toBe(400);
  });
});

describe('POST /api/pierrot/human/action', () => {
  it('rejects unknown actions', async () => {
    const response = await actionPost(
      makeRequest('/api/pierrot/human/action', {
        conversationId,
        sessionId,
        action: 'delete-everything',
      })
    );

    expect(response.status).toBe(400);
  });

  it('cancels a pending request as the visitor', async () => {
    asMock(human.getHumanPresenceForConversation).mockResolvedValue(record('pending'));
    asMock(human.getHumanPresenceByRequestId).mockResolvedValue(record('pending'));
    asMock(human.declineHumanRequest).mockResolvedValue({
      result: 'declined',
      requestId,
      conversationId,
      visitorLabel: '#A821',
      telegramChatId: 123456789,
      telegramMessageId: 77,
    });

    const response = await actionPost(
      makeRequest('/api/pierrot/human/action', {
        conversationId,
        sessionId,
        action: 'cancel',
      })
    );

    expect(response.status).toBe(200);
    expect(human.declineHumanRequest).toHaveBeenCalledWith(
      expect.anything(),
      requestId,
      'visitor'
    );
  });

  it('closes an active conversation as the visitor', async () => {
    asMock(human.getHumanPresenceForConversation).mockResolvedValue(record('active'));
    asMock(human.getHumanPresenceByRequestId).mockResolvedValue(record('active'));
    asMock(human.closeHumanSession).mockResolvedValue({
      result: 'closed',
      requestId,
      conversationId,
      sessionId: '55555555-5555-4555-8555-555555555555',
      visitorLabel: '#A821',
      telegramChatId: 123456789,
      telegramMessageId: 77,
    });

    const response = await actionPost(
      makeRequest('/api/pierrot/human/action', {
        conversationId,
        sessionId,
        action: 'close',
      })
    );

    expect(response.status).toBe(200);
    expect(human.closeHumanSession).toHaveBeenCalledWith(
      expect.anything(),
      requestId,
      'visitor'
    );
  });
});
