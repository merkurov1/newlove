/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPage = jest.fn();
const mockAggregates = jest.fn();

jest.mock('@/lib/serverAuth', () => ({
  getServerSupabaseClient: () => ({ from: jest.fn() }),
}));

jest.mock('@/lib/temple/chronicles.server', () => ({
  loadTempleChroniclesPage: (...args: unknown[]) => mockPage(...args),
}));

jest.mock('@/lib/temple/feed.server', () => ({
  loadTemplePublicAggregates: (...args: unknown[]) => mockAggregates(...args),
}));

const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

function request(query = '') {
  return new Request(`http://localhost/api/temple_logs/chronicles${query}`);
}

function page(overrides: Record<string, unknown> = {}) {
  return {
    page: {
      events: [
        {
          id: 'trace-1',
          ritual: 'ASH',
          ritualLabel: 'Let It Go',
          description: 'Released a burden and let it go.',
          occurredAt: '2026-11-24T12:00:00.000Z',
          visitor: null,
        },
      ],
      nextCursor: null,
      hasMore: false,
    },
    limit: 20,
    badCursor: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPage.mockResolvedValue(page());
  mockAggregates.mockResolvedValue({
    aggregates: {
      completedRituals: 12,
      namedAuthors: 2,
      vigilSparks: 3,
      byType: { ASH: 12 },
      windowDays: 30,
      windowStart: '2026-10-25T12:00:00.000Z',
      windowEnd: '2026-11-24T12:00:00.000Z',
      truncated: false,
    },
    truncated: false,
  });
});

describe('GET /api/temple_logs/chronicles', () => {
  it('returns the first page and the public aggregates without cache metadata', async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).not.toHaveProperty('message');
    expect(body.events[0]).not.toHaveProperty('user_id');
    expect(body.aggregates.completedRituals).toBe(12);
    expect(body).not.toHaveProperty('meta');
    expect(body).not.toHaveProperty('stats');
  });

  it('does not recompute aggregates on an older page', async () => {
    const response = await GET(request('?before=cursor-1&limit=10'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.aggregates).toBeNull();
    expect(mockAggregates).not.toHaveBeenCalled();
    expect(mockPage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ before: 'cursor-1', limit: 10 })
    );
  });

  it('rejects a tampered cursor without querying a page', async () => {
    mockPage.mockResolvedValue(page({ badCursor: true }));

    const response = await GET(request('?before=tampered'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.events).toEqual([]);
  });

  it('returns a safe empty error when the database is unavailable', async () => {
    mockPage.mockRejectedValue(new Error('connection string details'));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error).toBe('The chronicle is temporarily unavailable');
    expect(JSON.stringify(body)).not.toContain('connection string details');
  });
});
