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
  it('uses a verified Supabase name and UUID, never the body author', async () => {
    mockIdentity.mockResolvedValue({
      key: `sb:${USER_ID}`,
      userId: USER_ID,
      displayName: 'Pilgrim',
      source: 'supabase',
      email: 'pilgrim@example.com',
    });

    const response = await POST(
      makeRequest({
        event_type: 'ABSOLUTION',
        message: 'A trace',
        author: 'Mallory',
      })
    );

    expect(response.status).toBe(201);
    expect(insertedRow()).toMatchObject({
      user_id: USER_ID,
      author: 'Pilgrim',
      event_type: 'ABSOLUTION',
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
      })
    );

    expect(response.status).toBe(201);
    expect(insertedRow()).toMatchObject({
      user_id: null,
      author: 'Anna',
      event_type: 'ASH',
    });
  });

  it('keeps anonymous traces working with an untrusted display label only', async () => {
    const response = await POST(
      makeRequest({
        event_type: 'MEDITATION',
        message: 'Stayed calm',
        author: 'Mallory',
      })
    );

    expect(response.status).toBe(201);
    expect(insertedRow()).toMatchObject({
      user_id: null,
      author: 'Mallory',
    });
  });

  it('still rejects event types owned by trusted server routes', async () => {
    const response = await POST(
      makeRequest({
        event_type: 'VIGIL_SPARK',
        message: 'Forged spark',
      })
    );

    expect(response.status).toBe(400);
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
