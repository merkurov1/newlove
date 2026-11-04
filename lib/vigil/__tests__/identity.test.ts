/** @jest-environment node */

import { signSession } from '@/lib/session';
import { resolveVigilIdentity } from '@/lib/vigil/identity';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function request(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/vigil/claim', {
    method: 'POST',
    headers,
  });
}

function adminWith({
  user = {
    id: USER_ID,
    email: 'pilgrim@example.com',
    user_metadata: {},
  } as any,
  profile = null as any,
  legacyUser = null as any,
  authError = null as any,
} = {}) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: authError ? null : user },
        error: authError,
      }),
    },
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === 'profiles' ? profile : legacyUser,
              error: null,
            }),
          }),
        }),
      };
    },
  };
}

beforeAll(() => {
  process.env.NEXT_JWT_SECRET =
    'test-vigil-session-secret-with-at-least-32-characters';
});

describe('Vigil identity', () => {
  it('accepts a signed Telegram temple_session cookie', async () => {
    const token = signSession({
      userId: '100200300',
      displayName: 'Anna',
    });

    const identity = await resolveVigilIdentity(
      request({ cookie: `temple_session=${encodeURIComponent(token)}` }),
      adminWith() as any
    );

    expect(identity).toEqual({
      key: 'tg:100200300',
      userId: '100200300',
      displayName: 'Anna',
      source: 'telegram',
    });
  });

  it('accepts a signed Telegram bearer token', async () => {
    const token = signSession({
      userId: '100200300',
      displayName: 'Anna',
    });

    const identity = await resolveVigilIdentity(
      request({ authorization: `Bearer ${token}` }),
      adminWith() as any
    );

    expect(identity?.source).toBe('telegram');
    expect(identity?.key).toBe('tg:100200300');
  });

  it('uses the same display name as AuthContext for Supabase users', async () => {
    const identity = await resolveVigilIdentity(
      request({ authorization: 'Bearer supabase-access-token' }),
      adminWith({ profile: { name: 'Pilgrim' } }) as any
    );

    expect(identity).toEqual({
      key: `sb:${USER_ID}`,
      userId: USER_ID,
      displayName: 'Pilgrim',
      source: 'supabase',
    });
  });

  it('falls back to the legacy users table and then the email prefix', async () => {
    const legacy = await resolveVigilIdentity(
      request({ authorization: 'Bearer supabase-access-token' }),
      adminWith({ legacyUser: { name: 'Old Name' } }) as any
    );
    expect(legacy?.displayName).toBe('Old Name');

    const fallback = await resolveVigilIdentity(
      request({ authorization: 'Bearer supabase-access-token' }),
      adminWith() as any
    );
    expect(fallback?.displayName).toBe('pilgrim');
  });

  it('rejects forged, unsigned and missing identities', async () => {
    expect(
      await resolveVigilIdentity(
        request({ cookie: 'temple_session=forged-token' }),
        adminWith() as any
      )
    ).toBeNull();

    expect(
      await resolveVigilIdentity(
        request({ authorization: 'Bearer invalid-supabase-token' }),
        adminWith({ authError: new Error('invalid token') }) as any
      )
    ).toBeNull();

    expect(await resolveVigilIdentity(request(), adminWith() as any)).toBeNull();
  });
});
