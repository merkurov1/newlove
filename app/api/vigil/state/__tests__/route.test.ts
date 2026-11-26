/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetState = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ service: true })),
}));

jest.mock('@/lib/vigil/publicState', () => ({
  getVigilPublicState: (...args: unknown[]) => mockGetState(...args),
}));

const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

const state = {
  supporterCount: 9,
  lastLitAt: '2026-11-24T12:00:00.000Z',
  flameExpiresAt: '2026-11-25T12:00:00.000Z',
  flameLit: true,
  windowStartedAt: '2026-11-23T12:00:00.000Z',
  updatedAt: '2026-11-24T12:00:01.000Z',
  lifetimeTotal: 220,
  uniqueParticipants: 80,
  returningParticipants: 16,
  repeatRate: 0.2,
  telegramParticipants: 50,
  supabaseParticipants: 30,
  analyticsSince: '2026-11-16T09:00:00.000Z',
  analyticsAvailable: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetState.mockResolvedValue(state);
});

describe('GET /api/vigil/state', () => {
  it('returns the server-computed supporter count and public flame only', async () => {
    const response = await GET(
      new Request('http://localhost/api/vigil/state')
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(payload).toEqual(state);
    expect(Object.keys(payload).sort()).toEqual(
      [
        'supporterCount',
        'lastLitAt',
        'flameExpiresAt',
        'flameLit',
        'windowStartedAt',
        'updatedAt',
        'lifetimeTotal',
        'uniqueParticipants',
        'returningParticipants',
        'repeatRate',
        'telegramParticipants',
        'supabaseParticipants',
        'analyticsSince',
        'analyticsAvailable',
      ].sort()
    );
  });

  it('fails closed without a fallback or fabricated count', async () => {
    mockGetState.mockRejectedValue(new Error('database unavailable'));

    const response = await GET(
      new Request('http://localhost/api/vigil/state')
    );
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(503);
    expect(payload).toEqual({ error: 'Vigil state unavailable' });
    expect(payload).not.toHaveProperty('supporterCount');
  });
});
