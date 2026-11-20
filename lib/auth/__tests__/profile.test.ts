/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CANONICAL_PROFILE_TABLE, LEGACY_PROFILE_TABLE, loadAuthProfile } from '../profile';

type TableResult = { data: unknown; error: unknown };

function client(responses: Record<string, TableResult[]>) {
  const from = jest.fn((table: string) => {
    const queue = responses[table] ?? [];
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            const next = queue.shift();
            return next ?? { data: null, error: null };
          },
        }),
      }),
    };
  });

  return { from } as unknown as SupabaseClient;
}

describe('loadAuthProfile', () => {
  it('reads the canonical public.users row first', async () => {
    const supabase = client({
      [CANONICAL_PROFILE_TABLE]: [
        { data: { id: 'user-1', name: 'Anton', role: 'ADMIN' }, error: null },
      ],
      [LEGACY_PROFILE_TABLE]: [{ data: { id: 'user-1', name: 'Legacy' }, error: null }],
    });

    await expect(loadAuthProfile(supabase, 'user-1')).resolves.toEqual({
      profile: { id: 'user-1', name: 'Anton', role: 'ADMIN' },
      source: CANONICAL_PROFILE_TABLE,
    });
    expect((supabase.from as jest.Mock).mock.calls.map(([table]) => table)).toEqual(['users']);
  });

  it('falls back to public.profiles only when the canonical row is absent', async () => {
    const supabase = client({
      [CANONICAL_PROFILE_TABLE]: [{ data: null, error: null }],
      [LEGACY_PROFILE_TABLE]: [{ data: { id: 'user-1', wallet_address: '0xabc' }, error: null }],
    });

    await expect(loadAuthProfile(supabase, 'user-1')).resolves.toEqual({
      profile: { id: 'user-1', wallet_address: '0xabc' },
      source: LEGACY_PROFILE_TABLE,
    });
    expect((supabase.from as jest.Mock).mock.calls.map(([table]) => table)).toEqual([
      'users',
      'profiles',
    ]);
  });

  it('returns no profile when both tables have no row', async () => {
    const supabase = client({
      [CANONICAL_PROFILE_TABLE]: [{ data: null, error: null }],
      [LEGACY_PROFILE_TABLE]: [{ data: null, error: null }],
    });

    await expect(loadAuthProfile(supabase, 'user-1')).resolves.toEqual({
      profile: null,
      source: null,
    });
  });

  it('does not treat an error payload as a profile', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const supabase = client({
      [CANONICAL_PROFILE_TABLE]: [{ data: null, error: { message: 'denied' } }],
      [LEGACY_PROFILE_TABLE]: [{ data: null, error: null }],
    });

    await expect(loadAuthProfile(supabase, 'user-1')).resolves.toEqual({
      profile: null,
      source: null,
    });
    warn.mockRestore();
  });
});
