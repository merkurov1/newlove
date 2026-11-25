/** @jest-environment node */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCurrentUser = jest.fn();
const mockIdentity = jest.fn();

jest.mock('@/lib/serverAuth', () => ({
  getCurrentUser: () => mockCurrentUser(),
  getServerSupabaseClient: () => ({}),
}));

jest.mock('@/lib/temple/identity', () => ({
  resolveTempleIdentity: (...args: unknown[]) => mockIdentity(...args),
}));

const { GET } = require('../route') as {
  GET: (request: Request) => Promise<Response>;
};

function request(cookie = '') {
  return new Request('http://localhost/api/temple/me', {
    headers: cookie ? { cookie } : {},
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentUser.mockResolvedValue(null);
  mockIdentity.mockResolvedValue(null);
});

describe('GET /api/temple/me', () => {
  it('ignores the legacy client-written temple_user cookie', async () => {
    const response = await GET(request('temple_user=Mallory'));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(payload).toEqual({ displayName: null, source: null });
  });

  it('returns a verified Telegram display name', async () => {
    mockIdentity.mockResolvedValue({
      key: 'tg:100200300',
      userId: '100200300',
      displayName: 'Anna',
      source: 'telegram',
      email: null,
    });

    const response = await GET(request('temple_session=signed'));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toEqual({ displayName: 'Anna', source: 'telegram' });
  });

  it('returns a verified Supabase cookie identity', async () => {
    mockCurrentUser.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'pilgrim@example.com',
      profile: { name: 'Pilgrim' },
    });

    const response = await GET(request('sb-cookie=1'));
    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload).toEqual({ displayName: 'Pilgrim', source: 'supabase' });
    expect(mockIdentity).not.toHaveBeenCalled();
  });
});
