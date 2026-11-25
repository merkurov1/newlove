/** @jest-environment node */

import { signSession } from '@/lib/session';
import { resolveTempleIdentity } from '@/lib/temple/identity';

const USER_ID = '11111111-1111-4111-8111-111111111111';

function request(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/temple', {
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
} = {}) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from(table: string) {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: table === 'profiles' ? profile : null,
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
    'test-temple-session-secret-with-at-least-32-characters';
});

describe('shared Temple identity', () => {
  it('never merges Telegram and Supabase identities that share a name or email', async () => {
    const telegramToken = signSession({
      userId: '100200300',
      displayName: 'Pilgrim',
    });

    const telegram = await resolveTempleIdentity(
      request({ cookie: `temple_session=${encodeURIComponent(telegramToken)}` }),
      adminWith({ profile: { name: 'Pilgrim' } }) as any
    );

    const supabase = await resolveTempleIdentity(
      request({ authorization: 'Bearer supabase-access-token' }),
      adminWith({ profile: { name: 'Pilgrim' } }) as any
    );

    expect(telegram).toMatchObject({
      key: 'tg:100200300',
      userId: '100200300',
      displayName: 'Pilgrim',
      source: 'telegram',
      email: null,
    });
    expect(supabase).toMatchObject({
      key: `sb:${USER_ID}`,
      userId: USER_ID,
      displayName: 'Pilgrim',
      source: 'supabase',
      email: 'pilgrim@example.com',
    });
    expect(telegram?.key).not.toBe(supabase?.key);
  });

  it('ignores a client-written temple_user cookie', async () => {
    const identity = await resolveTempleIdentity(
      request({ cookie: 'temple_user=Mallory' }),
      adminWith() as any
    );

    expect(identity).toBeNull();
  });

  it('rejects forged temple_session values', async () => {
    const identity = await resolveTempleIdentity(
      request({ cookie: 'temple_session=forged-token' }),
      adminWith() as any
    );

    expect(identity).toBeNull();
  });

  it('returns no identity for an anonymous request', async () => {
    expect(
      await resolveTempleIdentity(request(), adminWith() as any)
    ).toBeNull();
  });
});
