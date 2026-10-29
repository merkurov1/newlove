/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockResolvedValue: (value: unknown) => void;
};

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
}));

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: jest.fn(() => ({ mocked: true })),
}));

jest.mock('@/lib/pierrot/serverStore', () => ({
  recordPierrotEventByConversationId: jest.fn(async () => true),
}));

const eventStore = require('@/lib/pierrot/serverStore') as {
  recordPierrotEventByConversationId: MockFn;
};

const fetchMock = jest.fn() as unknown as MockFn;
const { POST } = require('../telegram/route') as {
  POST: (request: Request) => Promise<Response>;
};

const conversationId = '11111111-1111-4111-8111-111111111111';
const attribution = `punf_${conversationId}`;

function makeRequest(overrides: Record<string, unknown> = {}): Request {
  return new Request('http://localhost/api/unframed/telegram', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      form: { name: 'Agent', agency: 'Agency', email: 'person@example.com' },
      pierrotAttribution: attribution,
      requestId: 'request_12345',
      ...overrides,
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.TELEGRAM_BOT_TOKEN = 'bot-token';
  process.env.TELEGRAM_CHAT_ID = 'chat-id';
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('POST /api/unframed/telegram', () => {
  it('keeps the existing Telegram integration and records a submitted request', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(eventStore.recordPierrotEventByConversationId).toHaveBeenCalledWith(
      { mocked: true },
      expect.objectContaining({
        conversationId,
        eventName: 'unframed_request_submitted',
        eventKey: 'unframed_request_submitted:request_12345',
      })
    );

    const call = eventStore.recordPierrotEventByConversationId.mock.calls[0][1] as {
      payload: Record<string, unknown>;
    };
    expect(JSON.stringify(call.payload)).not.toContain('person@example.com');
    expect(JSON.stringify(call.payload)).not.toContain('Agent');
  });

  it('rejects invalid proposal details before Telegram', async () => {
    const response = await POST(makeRequest({ form: { name: '', agency: '', email: 'bad' } }));

    expect(response.status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(eventStore.recordPierrotEventByConversationId).not.toHaveBeenCalled();
  });

  it('does not record a submitted request when Telegram fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false }),
    });

    const response = await POST(makeRequest());

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(eventStore.recordPierrotEventByConversationId).not.toHaveBeenCalled();
  });

  it('does not hide missing Telegram configuration', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;

    const response = await POST(makeRequest());

    expect(response.status).toBe(500);
    expect(eventStore.recordPierrotEventByConversationId).not.toHaveBeenCalled();
  });
});
