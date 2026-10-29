/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type MockFn = {
  mock: { calls: unknown[][] };
  mockReturnValue: (value: unknown) => void;
  mockResolvedValue: (value: unknown) => void;
  mockResolvedValueOnce: (value: unknown) => void;
  mockRejectedValue: (value: unknown) => void;
  mockReset: () => void;
  mockImplementation: (implementation: (...args: unknown[]) => unknown) => void;
};

function asMock(value: unknown): MockFn {
  return value as unknown as MockFn;
}

jest.mock('@/lib/serverAuth', () => ({
  getCurrentUser: jest.fn(async () => null),
  requireAdminFromRequest: jest.fn(async () => {
    throw new Error('not admin');
  }),
}));

jest.mock('@/lib/rateLimit', () => ({
  checkRateLimit: jest.fn(() => null),
  getClientIp: jest.fn(() => 'test-client'),
}));

jest.mock('@/lib/pierrot/serverStore', () => {
  const actual = jest.requireActual('@/lib/pierrot/serverStore') as Record<string, unknown>;

  return {
    ...actual,
    createPierrotStore: jest.fn(),
    ensurePierrotConversation: jest.fn(),
    findPierrotAssistantReply: jest.fn(),
    conversationBelongsToSession: jest.fn(),
    appendPierrotMessage: jest.fn(),
    recordPierrotEvent: jest.fn(),
    persistenceFailure: jest.fn(),
  };
});

jest.mock('@/lib/pierrot/serviceInquiryStore', () => ({
  advanceStoredServiceInquiry: jest.fn(async () => null),
}));

jest.mock('openai', () => {
  const create = jest.fn();

  return {
    __esModule: true,
    __createMock: create,
    default: jest.fn(() => ({
      chat: {
        completions: { create },
      },
    })),
  };
});

process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';

// require (not a static import) so the jest.mock registrations above are in
// effect before the route and its dependencies are loaded.
const OpenAIModule = require('openai') as { __createMock: unknown };
const pierrotStore =
  require('@/lib/pierrot/serverStore') as typeof import('@/lib/pierrot/serverStore');
const serviceInquiryStore = require('@/lib/pierrot/serviceInquiryStore') as {
  advanceStoredServiceInquiry: {
    mock: { calls: unknown[][] };
    mockResolvedValue: (value: unknown) => void;
  };
};
const { POST } = require('../route') as {
  POST: (request: Request) => Promise<Response>;
};

const mockCreate = asMock(OpenAIModule.__createMock);
const mockRecord: string[] = [];

const conversationId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const userMessageId = '33333333-3333-4333-8333-333333333333';

function makeRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/pierrot-web', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    message: 'Tell me about the archive.',
    conversationId,
    sessionId,
    userMessageId,
    consent: { state: 'granted', version: '2026-10-29' },
    context: {
      pathname: '/lobby?email=private@example.com',
      referrer: 'https://news.example/story?q=secret',
    },
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRecord.length = 0;

  asMock(pierrotStore.createPierrotStore).mockReturnValue({ mocked: true });
  asMock(pierrotStore.ensurePierrotConversation).mockImplementation(async () => {
    mockRecord.push('conversation');
  });
  asMock(pierrotStore.conversationBelongsToSession).mockReset();
  asMock(pierrotStore.conversationBelongsToSession).mockResolvedValue(true);
  asMock(pierrotStore.findPierrotAssistantReply).mockReset();
  asMock(pierrotStore.findPierrotAssistantReply).mockResolvedValue(null);
  asMock(pierrotStore.appendPierrotMessage).mockImplementation(async (...args: unknown[]) => {
    const input = args[1] as { role: string; content: string };
    mockRecord.push(`message:${input.role}`);
    return {
      sequence: input.role === 'user' ? 1 : 2,
      content: input.content,
      inserted: true,
    };
  });
  asMock(pierrotStore.recordPierrotEvent).mockImplementation(async (...args: unknown[]) => {
    const input = args[1] as { eventName: string };
    mockRecord.push(`event:${input.eventName}`);
    return true;
  });
  asMock(pierrotStore.persistenceFailure).mockImplementation(() => undefined);
  serviceInquiryStore.advanceStoredServiceInquiry.mockResolvedValue(null);

  mockCreate.mockReset();
  mockCreate.mockImplementation(async () => {
    mockRecord.push('ai');
    return { choices: [{ message: { content: 'Pierrot reply' } }] };
  });
});

describe('POST /api/pierrot-web persistence', () => {
  it('stores the user message before the assistant reply and keeps order', async () => {
    const response = await POST(makeRequest(validBody()));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      reply: 'Pierrot reply',
      provider: 'deepseek',
      conversationId,
      sessionId,
      userMessageId,
      recorded: true,
    });
    expect(mockRecord).toEqual([
      'conversation',
      'event:conversation_started',
      'message:user',
      'event:message_sent',
      'event:intent_classified',
      'ai',
      'message:assistant',
      'event:assistant_replied',
    ]);

    const startCall = asMock(pierrotStore.ensurePierrotConversation).mock.calls[0][1] as {
      startPage?: string;
      referrer?: string;
    };
    expect(startCall.startPage).toBe('/lobby');
    expect(startCall.referrer).toBe('https://news.example/story');
  });

  it('returns a verified offer response without calling the model', async () => {
    const response = await POST(
      makeRequest(validBody({ message: 'I want to buy the Heart & Angel postcard' }))
    );
    const json = (await response.json()) as {
      reply?: string;
      cta?: { href?: string };
      intent?: { name?: string };
    };

    expect(response.status).toBe(200);
    expect(json.intent?.name).toBe('purchase_intent');
    expect(json.reply).toContain('£29');
    expect(json.cta?.href).toBe('/heartandangel/card#order');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockRecord).toEqual([
      'conversation',
      'event:conversation_started',
      'message:user',
      'event:message_sent',
      'event:intent_classified',
      'event:offer_viewed',
      'event:cta_shown',
      'message:assistant',
      'event:assistant_replied',
    ]);
  });

  it('returns the deterministic qualification question for a service inquiry', async () => {
    serviceInquiryStore.advanceStoredServiceInquiry.mockResolvedValue({
      id: 'lead-12345678',
      status: 'new',
      needType: 'analysis',
      stage: null,
      timeline: null,
      questionsAsked: 1,
      qualified: false,
      nextQuestion: 'stage',
      summary: 'analysis',
    });

    const response = await POST(
      makeRequest(validBody({ message: 'I need help analysing my collection' }))
    );
    const json = (await response.json()) as {
      reply?: string;
      links?: unknown[];
      actions?: unknown[];
      cta?: unknown;
    };

    expect(response.status).toBe(200);
    expect(json.reply).toContain('Where are you in the process');
    expect(json.actions?.length).toBeGreaterThan(0);
    expect(json.links).toBeUndefined();
    expect(json.cta).toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(serviceInquiryStore.advanceStoredServiceInquiry).toHaveBeenCalledTimes(1);
  });

  it('returns the qualified service summary link without exposing contact data', async () => {
    serviceInquiryStore.advanceStoredServiceInquiry.mockResolvedValue({
      id: 'lead-12345678',
      status: 'qualified',
      needType: 'analysis',
      stage: 'exploring',
      timeline: 'this_quarter',
      questionsAsked: 2,
      qualified: true,
      nextQuestion: null,
      summary: 'analysis / exploring / this_quarter',
    });

    const response = await POST(
      makeRequest(validBody({ message: 'I need help analysing my collection' }))
    );
    const json = (await response.json()) as {
      links?: Array<{ href?: string }>;
      reply?: string;
    };

    expect(json.reply).toContain('Summary');
    expect(json.links?.[0]?.href).toBe('/advising/request?lead=lead-12345678&lang=en');
    expect(JSON.stringify(json)).not.toContain('@');
  });

  it('resolves a demonstrative question on the postcard page without the model', async () => {
    const response = await POST(
      makeRequest(
        validBody({
          message: 'How much is this?',
          context: { pathname: '/heartandangel/card' },
        })
      )
    );
    const json = (await response.json()) as {
      reply?: string;
      offerId?: string;
      cta?: { href?: string };
    };

    expect(response.status).toBe(200);
    expect(json.offerId).toBe('heart_angel_postcard');
    expect(json.cta?.href).toBe('/heartandangel/card#order');
    expect(json.reply).toContain('£29');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('replays an existing assistant reply instead of writing a duplicate on retry', async () => {
    asMock(pierrotStore.findPierrotAssistantReply).mockResolvedValueOnce({
      content: 'Stored reply',
      provider: 'deepseek',
    });

    const response = await POST(makeRequest(validBody()));
    const json = (await response.json()) as { replayed?: boolean; reply?: string };

    expect(response.status).toBe(200);
    expect(json.replayed).toBe(true);
    expect(json.reply).toBe('Stored reply');
    expect(mockCreate).not.toHaveBeenCalled();
    expect(pierrotStore.appendPierrotMessage).not.toHaveBeenCalled();
    expect(mockRecord).toEqual(['conversation', 'event:conversation_started']);
  });

  it('does not read a stored reply when the session does not own the conversation', async () => {
    asMock(pierrotStore.conversationBelongsToSession).mockResolvedValue(false);
    asMock(pierrotStore.findPierrotAssistantReply).mockResolvedValueOnce({
      content: "Somebody else's transcript",
      provider: 'deepseek',
    });

    const response = await POST(
      makeRequest(validBody({ sessionId: '44444444-4444-4444-8444-444444444444' }))
    );
    const json = (await response.json()) as { reply?: string };

    expect(response.status).toBe(200);
    expect(json.reply).toBe('Pierrot reply');
    expect(pierrotStore.findPierrotAssistantReply).not.toHaveBeenCalled();
  });

  it('records a safe failure event without leaking provider errors', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockCreate.mockRejectedValue(new Error('SECRET provider stack token=abc'));

    const response = await POST(makeRequest(validBody()));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'The ether is disrupted.' });

    const failureCall = asMock(pierrotStore.recordPierrotEvent).mock.calls.find(
      (call) => (call[1] as { eventName?: string }).eventName === 'assistant_failed'
    ) as [unknown, { payload?: unknown }] | undefined;

    expect(failureCall?.[1].payload).toEqual({
      message_id: userMessageId,
      code: 'ai_unavailable',
    });
    expect(JSON.stringify(failureCall?.[1])).not.toContain('SECRET');
    expect(JSON.stringify(json)).not.toContain('SECRET');

    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('rejects oversized messages before touching storage', async () => {
    const response = await POST(makeRequest(validBody({ message: 'x'.repeat(4001) })));

    expect(response.status).toBe(413);
    expect(pierrotStore.createPierrotStore).not.toHaveBeenCalled();
  });

  it('rejects malformed identifiers', async () => {
    const response = await POST(makeRequest(validBody({ conversationId: '../../etc/passwd' })));

    expect(response.status).toBe(400);
    expect(pierrotStore.createPierrotStore).not.toHaveBeenCalled();
  });

  it('does not write a transcript when consent is denied', async () => {
    const response = await POST(
      makeRequest(validBody({ consent: { state: 'denied', version: '2026-10-29' } }))
    );
    const json = (await response.json()) as { recorded?: boolean };

    expect(response.status).toBe(200);
    expect(json.recorded).toBe(false);
    expect(pierrotStore.createPierrotStore).not.toHaveBeenCalled();
    expect(pierrotStore.appendPierrotMessage).not.toHaveBeenCalled();
  });
});
