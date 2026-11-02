/** @jest-environment node */

import { describe, expect, it, jest } from '@jest/globals';
import { ensurePierrotConversation } from '../serverStore';

type Captured = {
  upserts: Array<Record<string, unknown>>;
  updates: Array<Record<string, unknown>>;
  filters: Array<[string, string, unknown]>;
};

function fakeStore(options: { failIdentityOnce?: boolean } = {}): {
  store: unknown;
  captured: Captured;
} {
  const captured: Captured = { upserts: [], updates: [], filters: [] };
  let failed = false;
  let updateFailed = false;

  const makeAwaitable = (result: { error: unknown }) => ({
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject),
  });

  const makeFilter = (result: { error: unknown }) => {
    const filter = (column: string, value: unknown) => {
      captured.filters.push(['eq', column, value]);
      return {
        ...makeAwaitable(result),
        eq: (nextColumn: string, nextValue: unknown) => {
          captured.filters.push(['eq', nextColumn, nextValue]);
          return {
            ...makeAwaitable(result),
            neq: (neqColumn: string, neqValue: unknown) => {
              captured.filters.push(['neq', neqColumn, neqValue]);
              return makeAwaitable(result);
            },
          };
        },
        neq: (neqColumn: string, neqValue: unknown) => {
          captured.filters.push(['neq', neqColumn, neqValue]);
          return makeAwaitable(result);
        },
      };
    };

    return filter;
  };

  const store = {
    from: jest.fn(() => ({
      upsert: jest.fn(async (payload: Record<string, unknown>) => {
        captured.upserts.push(payload);

        if (options.failIdentityOnce && !failed) {
          failed = true;
          return {
            error: { code: 'PGRST204', message: "Could not find the 'identity_type' column" },
          };
        }

        return { error: null };
      }),
      update: jest.fn((payload: Record<string, unknown>) => {
        captured.updates.push(payload);
        const result =
          options.failIdentityOnce && !updateFailed && 'identity_type' in payload
            ? (() => {
                updateFailed = true;
                return {
                  error: {
                    code: 'PGRST204',
                    message: "Could not find the 'identity_type' column",
                  },
                };
              })()
            : { error: null };

        return {
          eq: (column: string, value: unknown) => {
            captured.filters.push(['eq', column, value]);
            return makeFilter(result)(column, value);
          },
        };
      }),
    })),
  };

  return { store, captured };
}

const ownerUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const visitorId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function baseInput() {
  return {
    id: 'conversation-1',
    sessionId: 'session-1',
    startPage: '/',
    referrer: null,
    language: 'en' as const,
    consentState: 'granted' as const,
    consentVersion: '2026-10-29',
  };
}

describe('Pierrot conversation identity persistence', () => {
  it('stores owner attribution and clears any visitor pseudonym', async () => {
    const { store, captured } = fakeStore();

    await ensurePierrotConversation(store as never, {
      ...baseInput(),
      identity: {
        type: 'owner',
        userId: ownerUserId,
        visitorId: null,
        source: 'supabase_session',
        verifiedAt: '2026-11-02T10:00:00.000Z',
      },
    });

    expect(captured.upserts[0]).toMatchObject({
      identity_type: 'owner',
      user_id: ownerUserId,
      visitor_id: null,
      identity_source: 'supabase_session',
      identity_verified_at: '2026-11-02T10:00:00.000Z',
    });
    expect(captured.updates[0]).toMatchObject({
      identity_type: 'owner',
      user_id: ownerUserId,
      visitor_id: null,
    });
    expect(
      captured.filters.some(([kind, column]) => kind === 'neq' && column === 'identity_type')
    ).toBe(false);
  });

  it('stores visitor attribution but never overwrites owner', async () => {
    const { store, captured } = fakeStore();

    await ensurePierrotConversation(store as never, {
      ...baseInput(),
      identity: {
        type: 'visitor',
        userId: null,
        visitorId,
        source: 'visitor_local_storage',
        verifiedAt: null,
      },
    });

    expect(captured.upserts[0]).toMatchObject({
      identity_type: 'visitor',
      visitor_id: visitorId,
      user_id: null,
    });
    expect(captured.updates[0]).toMatchObject({
      identity_type: 'visitor',
      visitor_id: visitorId,
    });
    expect(
      captured.filters.some(
        ([kind, column, value]) => kind === 'neq' && column === 'identity_type' && value === 'owner'
      )
    ).toBe(true);
  });

  it('continues without attribution before the manual migration exists', async () => {
    const { store, captured } = fakeStore({ failIdentityOnce: true });

    await ensurePierrotConversation(store as never, {
      ...baseInput(),
      identity: {
        type: 'visitor',
        userId: null,
        visitorId,
        source: 'visitor_local_storage',
        verifiedAt: null,
      },
    });

    expect(captured.upserts).toHaveLength(2);
    expect(captured.upserts[1]).not.toHaveProperty('identity_type');
    expect(captured.updates.at(-1)).not.toHaveProperty('identity_type');
  });
});
