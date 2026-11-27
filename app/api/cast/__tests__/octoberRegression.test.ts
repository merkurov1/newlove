/** @jest-environment node */

/**
 * Regression guard for the 2026-10-12 duplicate case: two submissions 31
 * seconds apart had identical answer sets but different archetypes
 * (STONE vs VOID). The root cause was never proven, so this test does not
 * pretend the model is deterministic. It locks down what the product can
 * actually guarantee:
 *
 *   1. one submission identity produces exactly one record and one model call;
 *   2. a replay returns the stored reading verbatim;
 *   3. a genuinely new reading gets a new key and may legitimately differ, but
 *      it is always labelled as an interpretation, never as a measurement.
 *
 * Synthetic answers only — no production answers are reproduced here.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockIdentity = jest.fn();
const mockCastsInsert = jest.fn();
const mockIdempotentLookup = jest.fn();
const mockTempleLogInsert = jest.fn();
const mockRpc = jest.fn();
const mockCreate = jest.fn();

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

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    chat: { completions: { create: (...args: unknown[]) => mockCreate(...args) } },
  })),
}));

process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
process.env.CAST_CAPTURE_SECRET = 'cast-route-test-secret';

const { POST } = require('@/app/api/cast/route') as {
  POST: (request: Request) => Promise<Response>;
};

const ANSWERS = Array.from({ length: 10 }, (_, index) => `synthetic answer ${index + 1}`);

function analysis(archetype: 'STONE' | 'VOID') {
  return {
    agency_index: archetype === 'STONE' ? 44 : 32,
    archetype,
    scores: { VOID: 40, STONE: 60, NOISE: 20, UNFRAMED: 25 },
    executive_summary: 'The answers suggest a guarded stance.',
    structural_weaknesses: 'The text may indicate hesitation.',
    core_assets: 'Specific detail is present.',
    strategic_directive: 'Name one next step.',
  };
}

function request(key: string) {
  return new Request('http://localhost/api/cast', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-idempotency-key': key,
    },
    body: JSON.stringify({ language: 'en', answers: ANSWERS }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentity.mockResolvedValue(null);
  mockIdempotentLookup.mockResolvedValue({ data: null, error: null });
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
  mockCastsInsert.mockImplementation((row: Record<string, unknown>) => ({
    select: () => ({
      maybeSingle: async () => ({
        data: {
          id: `cast-${mockCastsInsert.mock.calls.length}`,
          created_at: '2026-11-25T10:00:00.000Z',
          ...row,
        },
        error: null,
      }),
    }),
  }));
  mockTempleLogInsert.mockResolvedValue({ error: null });
  mockCreate.mockResolvedValue({
    id: 'request-1',
    choices: [{ message: { content: JSON.stringify(analysis('STONE')) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  });
});

describe('Cast duplicate-submission regression (October case)', () => {
  it('performs one model call and one insert for one idempotency key', async () => {
    await POST(request('october-case-key-0001'));

    const stored = (mockCastsInsert.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;

    // Simulate the unique index becoming visible to the next request.
    mockIdempotentLookup.mockResolvedValue({
      data: {
        id: 'cast-1',
        created_at: '2026-11-25T10:00:00.000Z',
        user_id: null,
        archetype: stored.archetype,
        analysis: stored.analysis,
        capture_consumed_at: null,
      },
      error: null,
    });

    const replay = await POST(request('october-case-key-0001'));
    const payload = (await replay.json()) as Record<string, unknown>;

    expect(payload.replayed).toBe(true);
    // The replay never reaches the model and never inserts a second row.
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCastsInsert).toHaveBeenCalledTimes(1);
  });

  it('returns the stored reading on replay instead of re-interpreting it', async () => {
    await POST(request('october-case-key-0002'));

    const stored = (mockCastsInsert.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;

    mockIdempotentLookup.mockResolvedValue({
      data: {
        id: 'cast-existing',
        created_at: '2026-11-25T10:00:00.000Z',
        user_id: null,
        archetype: stored.archetype,
        analysis: stored.analysis,
        capture_consumed_at: null,
      },
      error: null,
    });

    const response = await POST(request('october-case-key-0002'));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.replayed).toBe(true);
    expect(payload.archetype).toBe(stored.archetype);
    expect(payload.analysis).toEqual(stored.analysis);
  });

  it('forbids diagnosis and requires hedged hypotheses in the prompt', async () => {
    await POST(request('october-case-key-0003'));

    const systemPrompt = String(
      (mockCreate.mock.calls[0]?.[0] as { messages?: Array<{ content?: string }> })
        ?.messages?.[0]?.content ?? ''
    );

    expect(systemPrompt).toContain('EPISTEMIC LIMITS');
    expect(systemPrompt).toContain('Never diagnose');
    expect(systemPrompt).toMatch(/hypothes/i);
    expect(systemPrompt).toMatch(/not a clinical or medical diagnosis/i);
  });
});
