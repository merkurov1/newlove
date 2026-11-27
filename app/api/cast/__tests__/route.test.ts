/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CREATED_AT = '2026-11-25T10:00:00.000Z';

const mockIdentity = jest.fn();
const mockCastsInsert = jest.fn();
const mockIdempotentLookup = jest.fn();
const mockTempleLogInsert = jest.fn();
const mockRpc = jest.fn();

const mockSupabase = {
  rpc: (...args: unknown[]) => mockRpc(...args),
  from(table: string) {
    if (table === 'casts') {
      return {
        insert: mockCastsInsert,
        select: () => ({
          eq: () => ({ maybeSingle: mockIdempotentLookup }),
        }),
      };
    }

    if (table === 'temple_log') return { insert: mockTempleLogInsert };

    throw new Error(`Unexpected table ${table}`);
  },
};

jest.mock('@/lib/temple/identity', () => ({
  resolveTempleIdentity: (...args: unknown[]) => mockIdentity(...args),
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

jest.mock('openai', () => {
  const analysis = {
    agency_index: 82,
    archetype: 'UNFRAMED',
    scores: { VOID: 10, STONE: 20, NOISE: 15, UNFRAMED: 80 },
    executive_summary: 'The answers suggest you act from clear intent.',
    structural_weaknesses: 'You still explain the past more than you shape it.',
    core_assets: 'Specific memory and structural thinking.',
    strategic_directive: 'Choose one next action today.',
  };

  return {
    __esModule: true,
    default: jest.fn(() => ({
      chat: {
        completions: {
          create: async () => ({
            id: 'provider-request-1',
            choices: [{ message: { content: JSON.stringify(analysis) } }],
            usage: {
              prompt_tokens: 120,
              completion_tokens: 80,
              total_tokens: 200,
            },
          }),
        },
      },
    })),
  };
});

process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
process.env.CAST_CAPTURE_SECRET = 'cast-route-test-secret';

const { POST } = require('../route') as {
  POST: (request: Request) => Promise<Response>;
};

function makeRequest(
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {}
) {
  return new Request('http://localhost/api/cast', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({
      language: 'en',
      answers: Array.from({ length: 10 }, (_, index) => `answer ${index + 1}`),
      // Client-supplied identity fields must never affect attribution.
      userId: 'forged-user',
      author: 'Mallory',
      status: 'identified',
      ...extra,
    }),
  });
}

function castRow() {
  expect(mockCastsInsert).toHaveBeenCalledTimes(1);

  return (mockCastsInsert.mock.calls[0] as unknown[])[0] as Record<
    string,
    unknown
  >;
}

function logRow() {
  expect(mockTempleLogInsert).toHaveBeenCalledTimes(1);

  return (mockTempleLogInsert.mock.calls[0] as unknown[])[0] as Record<
    string,
    unknown
  >;
}

function allowRateLimit() {
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
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentity.mockResolvedValue(null);
  mockIdempotentLookup.mockResolvedValue({ data: null, error: null });
  allowRateLimit();
  mockCastsInsert.mockImplementation((row: Record<string, unknown>) => ({
    select: () => ({
      maybeSingle: async () => ({
        data: { id: 'cast-1', created_at: CREATED_AT, ...row },
        error: null,
      }),
    }),
  }));
  mockTempleLogInsert.mockResolvedValue({ error: null });
});

describe('POST /api/cast identity policy', () => {
  it('records a verified Telegram identity without creating a Supabase UUID', async () => {
    mockIdentity.mockResolvedValue({
      key: 'tg:100200300',
      userId: '100200300',
      displayName: 'Anna',
      source: 'telegram',
      email: null,
    });

    const response = await POST(makeRequest({ show_identity: true }));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.recordId).toBe('cast-1');
    expect(payload).not.toHaveProperty('answers');
    expect(castRow()).toMatchObject({
      user_id: null,
      email: null,
      answers: [],
      status: 'anonymous',
    });
    expect(logRow()).toMatchObject({
      user_id: null,
      author: 'Anna',
      is_public_identity: true,
    });

    const publicMessage = String(logRow().message ?? '');

    expect(publicMessage).not.toContain('answer 1');
    expect(publicMessage).not.toContain('answer 10');
  });

  it('records a verified Supabase identity with its UUID and email', async () => {
    mockIdentity.mockResolvedValue({
      key: `sb:${USER_ID}`,
      userId: USER_ID,
      displayName: 'Pilgrim',
      source: 'supabase',
      email: 'pilgrim@example.com',
    });

    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(castRow()).toMatchObject({
      user_id: USER_ID,
      email: 'pilgrim@example.com',
      status: 'identified',
      // No explicit consent was given, so even an identified record keeps no
      // raw answers.
      answers: [],
      retention_consent: false,
    });
    expect(logRow()).toMatchObject({
      user_id: USER_ID,
      author: 'Anonymous',
      is_public_identity: false,
    });
  });

  it('keeps Cast open to anonymous visitors without inventing an identity', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(castRow()).toMatchObject({
      user_id: null,
      email: null,
      answers: [],
      status: 'anonymous',
    });
    expect(logRow()).toMatchObject({
      user_id: null,
      author: 'Anonymous',
      is_public_identity: false,
    });
  });

  it('ignores forged identity and status fields in the request body', async () => {
    await POST(makeRequest({ status: 'identified', user_id: USER_ID }));

    expect(castRow()).toMatchObject({
      user_id: null,
      status: 'anonymous',
    });
  });

  it('keeps answers only for an identified reader who opted in', async () => {
    mockIdentity.mockResolvedValue({
      key: `sb:${USER_ID}`,
      userId: USER_ID,
      displayName: 'Pilgrim',
      source: 'supabase',
      email: 'pilgrim@example.com',
    });

    await POST(makeRequest({ retain_answers: true }));

    expect(castRow()).toMatchObject({
      user_id: USER_ID,
      status: 'identified',
      retention_consent: true,
      answers: Array.from({ length: 10 }, (_, index) => `answer ${index + 1}`),
    });
  });

  it('never stores answers for an anonymous reader, even with a consent flag', async () => {
    await POST(makeRequest({ retain_answers: true }));

    expect(castRow()).toMatchObject({
      user_id: null,
      status: 'anonymous',
      retention_consent: false,
      answers: [],
    });
  });
});

describe('POST /api/cast abuse and idempotency controls', () => {
  it('rejects the request when the shared rate limit is exhausted', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          allowed: false,
          remaining: 0,
          reset_at: new Date(Date.now() + 120_000).toISOString(),
        },
      ],
      error: null,
    });

    const response = await POST(makeRequest());
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(429);
    expect(payload.code).toBe('rate_limited');
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(mockCastsInsert).not.toHaveBeenCalled();
  });

  it('replays a stored reading for the same idempotency key without a second insert', async () => {
    mockIdempotentLookup.mockResolvedValue({
      data: {
        id: 'cast-existing',
        created_at: CREATED_AT,
        user_id: null,
        archetype: 'STONE',
        analysis: {
          agency_index: 30,
          archetype: 'STONE',
          scores: { VOID: 20, STONE: 70, NOISE: 30, UNFRAMED: 10 },
          executive_summary: 'Stored reading.',
          structural_weaknesses: 'Stored weakness.',
          core_assets: 'Stored asset.',
          strategic_directive: 'Stored directive.',
        },
        capture_consumed_at: null,
      },
      error: null,
    });

    const key = 'idempotency-key-0001';
    const response = await POST(
      makeRequest({}, { 'x-idempotency-key': key })
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.replayed).toBe(true);
    expect(payload.recordId).toBe('cast-existing');
    expect(payload.captureToken).toEqual(expect.any(String));
    expect(mockCastsInsert).not.toHaveBeenCalled();
  });

  it('stores the idempotency key and private provenance with a new reading', async () => {
    const key = 'idempotency-key-0002';

    await POST(makeRequest({}, { 'x-idempotency-key': key }));

    const row = castRow();

    expect(row.idempotency_key).toBe(key);
    expect(row.analysis_metadata).toMatchObject({
      provider: 'deepseek',
      promptVersion: expect.any(String),
      temperature: expect.any(Number),
      requestId: 'provider-request-1',
      usage: {
        promptTokens: 120,
        completionTokens: 80,
        totalTokens: 200,
      },
    });
  });
});
