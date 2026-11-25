/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mockIdentity = jest.fn();
const mockCastsInsert = jest.fn();
const mockTempleLogInsert = jest.fn();

const mockSupabase = {
  from(table: string) {
    if (table === 'casts') return { insert: mockCastsInsert };
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
    executive_summary: 'You act from clear intent.',
    structural_weaknesses: 'You still explain the past.',
    core_assets: 'Specific memory and structural thinking.',
    strategic_directive: 'Choose one next action today.',
  };

  return {
    __esModule: true,
    default: jest.fn(() => ({
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { content: JSON.stringify(analysis) } }],
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

function makeRequest() {
  return new Request('http://localhost/api/cast', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      language: 'en',
      answers: Array.from({ length: 10 }, (_, index) => `answer ${index + 1}`),
      // Client-supplied identity fields must never affect attribution.
      userId: 'forged-user',
      author: 'Mallory',
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

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentity.mockResolvedValue(null);
  mockCastsInsert.mockImplementation((row: Record<string, unknown>) => ({
    select: () => ({
      maybeSingle: async () => ({
        data: { id: 'cast-1', created_at: '2026-11-25T10:00:00.000Z', ...row },
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

    const response = await POST(makeRequest());
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload.recordId).toBe('cast-1');
    expect(payload).not.toHaveProperty('answers');
    expect(castRow()).toMatchObject({
      user_id: null,
      email: null,
      answers: [],
    });
    expect(logRow()).toMatchObject({ user_id: null, author: 'Anna' });

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
      answers: Array.from({ length: 10 }, (_, index) => `answer ${index + 1}`),
    });
    expect(logRow()).toMatchObject({ user_id: USER_ID, author: 'Pilgrim' });
  });

  it('keeps Cast open to anonymous visitors without inventing an identity', async () => {
    const response = await POST(makeRequest());

    expect(response.status).toBe(200);
    expect(castRow()).toMatchObject({
      user_id: null,
      email: null,
      answers: [],
    });
    expect(logRow()).toMatchObject({ user_id: null, author: 'Visitor' });
  });
});
