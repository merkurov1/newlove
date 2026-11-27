/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mockIdentity = jest.fn();
const mockInvalidate = jest.fn();
const mockInsert = jest.fn();

const mockSupabase = {
  from: (table: string) => {
    if (table !== 'temple_log') {
      throw new Error(`Unexpected table ${table}`);
    }

    return { insert: mockInsert };
  },
};

jest.mock('@/lib/temple/identity', () => ({
  resolveTempleIdentity: (...args: unknown[]) => mockIdentity(...args),
}));

jest.mock('@/lib/temple/feed.server', () => ({
  invalidateTempleFeedCache: () => mockInvalidate(),
  resolveTempleFeed: jest.fn(),
}));

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: () => mockSupabase,
}));

const { POST } = require('../route') as {
  POST: (request: Request) => Promise<Response>;
};

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/temple_logs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function insertedRow() {
  expect(mockInsert).toHaveBeenCalledTimes(1);

  return (mockInsert.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIdentity.mockResolvedValue(null);
  mockInsert.mockImplementation((row: Record<string, unknown>) => ({
    select: () => ({
      single: async () => ({ data: { id: 'trace-1', ...row }, error: null }),
    }),
  }));
});

describe('POST /api/temple_logs identity attribution', () => {
  it('uses a verified Supabase name and UUID only after explicit opt-in', async () => {
    mockIdentity.mockResolvedValue({
      key: `sb:${USER_ID}`,
      userId: USER_ID,
      displayName: 'Pilgrim',
      source: 'supabase',
      email: 'pilgrim@example.com',
    });

    const response = await POST(
      makeRequest({
        event_type: 'WHISPER',
        message: 'A trace',
        author: 'Mallory',
        show_identity: true,
      })
    );

    expect(response.status).toBe(201);
    expect(insertedRow()).toMatchObject({
      user_id: USER_ID,
      author: 'Pilgrim',
      event_type: 'WHISPER',
      is_public_identity: true,
    });
  });

  it('keeps a verified identity private when consent is absent', async () => {
    mockIdentity.mockResolvedValue({
      key: `sb:${USER_ID}`,
      userId: USER_ID,
      displayName: 'Pilgrim',
      source: 'supabase',
      email: 'pilgrim@example.com',
    });

    const response = await POST(
      makeRequest({
        event_type: 'WHISPER',
        message: 'A trace',
        author: 'Mallory',
      })
    );

    expect(response.status).toBe(201);
    expect(insertedRow()).toMatchObject({
      author: 'Anonymous',
      is_public_identity: false,
    });
  });

  it('attributes a verified Telegram session without inventing a Supabase UUID', async () => {
    mockIdentity.mockResolvedValue({
      key: 'tg:100200300',
      userId: '100200300',
      displayName: 'Anna',
      source: 'telegram',
      email: null,
    });

    const response = await POST(
      makeRequest({
        event_type: 'ASH',
        message: 'Released a burden',
        author: 'Mallory',
        show_identity: true,
      })
    );

    expect(response.status).toBe(201);
    expect(insertedRow()).toMatchObject({
      user_id: null,
      author: 'Anna',
      event_type: 'ASH',
      is_public_identity: true,
    });
  });

  it('keeps anonymous traces anonymous by default even with a display label', async () => {
    const response = await POST(
      makeRequest({
        event_type: 'MEDITATION',
        message: 'Stayed calm',
        author: 'Mallory',
        metadata: { durationSeconds: 30 },
      })
    );

    expect(response.status).toBe(201);
    expect(insertedRow()).toMatchObject({
      user_id: null,
      author: 'Anonymous',
      is_public_identity: false,
      message: 'Completed 30 seconds of calm.',
    });
  });

  it('accepts an anonymous display label only after explicit opt-in', async () => {
    const response = await POST(
      makeRequest({
        event_type: 'MEDITATION',
        message: 'Stayed calm',
        author: 'Mallory',
        show_identity: true,
        metadata: { durationSeconds: 30 },
      })
    );

    expect(response.status).toBe(201);
    expect(insertedRow()).toMatchObject({
      user_id: null,
      author: 'Mallory',
      is_public_identity: true,
    });
  });

  it('records Absolution as an anonymous completion signal only', async () => {
    mockIdentity.mockResolvedValue({
      key: `sb:${USER_ID}`,
      userId: USER_ID,
      displayName: 'Alice',
      source: 'supabase',
      email: 'alice@example.com',
    });

    const response = await POST(
      makeRequest({
        event_type: 'ABSOLUTION',
        message:
          'Alice confessed: "Lust: Digital voyeurism" and received absolution.',
        author: 'Alice',
        show_identity: true,
      })
    );

    expect(response.status).toBe(201);

    const row = insertedRow();

    expect(row).toMatchObject({
      user_id: null,
      event_type: 'ABSOLUTION',
      author: 'Anonymous',
      is_public_identity: false,
      message: 'Completed the Absolution ritual.',
    });
    expect(JSON.stringify(row)).not.toContain('Lust');
    expect(JSON.stringify(row)).not.toContain('Alice');
    expect(JSON.stringify(row)).not.toContain(USER_ID);
  });

  it('does not accept a Calm trace before the shared completion threshold', async () => {
    const response = await POST(
      makeRequest({
        event_type: 'MEDITATION',
        message: 'Left after a moment',
        author: 'Mallory',
        metadata: { durationSeconds: 5 },
      })
    );

    expect(response.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects a Calm trace that omits its duration', async () => {
    const response = await POST(
      makeRequest({
        event_type: 'MEDITATION',
        message: 'Stayed calm',
        author: 'Mallory',
      })
    );

    expect(response.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('still rejects event types owned by trusted server routes', async () => {
    for (const eventType of ['VIGIL', 'VIGIL_SPARK', 'CAST', 'TRIBUTE']) {
      const response = await POST(
        makeRequest({
          event_type: eventType,
          message: 'Forged completion',
        })
      );

      expect(response.status).toBe(400);
    }

    expect(mockInsert).not.toHaveBeenCalled();
  });
});
