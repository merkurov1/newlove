/** @jest-environment node */

import { getVigilPublicState } from '@/lib/vigil/publicState';

type QueryCall = {
  table: string;
  select: unknown[];
  filters: Array<[string, unknown]>;
};

function createAdmin(options: {
  count?: number | null;
  claimError?: { message?: string } | null;
  lastLitAt?: string | null;
  flameError?: { message?: string } | null;
} = {}) {
  const calls: QueryCall[] = [];

  return {
    calls,
    from(table: string) {
      const call: QueryCall = { table, select: [], filters: [] };
      calls.push(call);

      const builder = {
        select(...args: unknown[]) {
          call.select.push(...args);
          return builder;
        },
        gt(column: string, value: unknown) {
          call.filters.push([column, value]);
          return Promise.resolve({
            count: options.count ?? 0,
            error: options.claimError ?? null,
          });
        },
        eq(column: string, value: unknown) {
          call.filters.push([column, value]);
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({
            data:
              options.lastLitAt === undefined
                ? { last_lit_at: null }
                : { last_lit_at: options.lastLitAt },
            error: options.flameError ?? null,
          });
        },
      };

      return builder;
    },
  };
}

const NOW = new Date('2026-11-24T12:00:00.000Z').getTime();

describe('authoritative Vigil public state', () => {
  it('counts only private claims inside the rolling 24h window', async () => {
    const lastLitAt = new Date(NOW - 60 * 60 * 1000).toISOString();
    const admin = createAdmin({ count: 14, lastLitAt });

    const state = await getVigilPublicState(admin as never, NOW);

    expect(state).toMatchObject({
      supporterCount: 14,
      lastLitAt,
      flameExpiresAt: new Date(
        new Date(lastLitAt).getTime() + 86_400_000
      ).toISOString(),
      flameLit: true,
      windowStartedAt: new Date(NOW - 86_400_000).toISOString(),
      updatedAt: new Date(NOW).toISOString(),
    });

    const claimCall = admin.calls.find(
      (call) => call.table === 'vigil_spark_claims'
    );

    expect(claimCall?.select[1]).toEqual({ count: 'exact', head: true });
    expect(claimCall?.filters).toEqual([
      ['last_spark_at', new Date(NOW - 86_400_000).toISOString()],
    ]);

    const flameCall = admin.calls.find(
      (call) => call.table === 'vigil_hearts'
    );

    expect(flameCall?.filters).toEqual([['id', 1]]);
  });

  it('reports an extinguished flame without hiding the real supporter count', async () => {
    const admin = createAdmin({
      count: 2,
      lastLitAt: new Date(NOW - 25 * 60 * 60 * 1000).toISOString(),
    });

    const state = await getVigilPublicState(admin as never, NOW);

    expect(state.supporterCount).toBe(2);
    expect(state.flameExpiresAt).toBe(
      new Date(NOW - 60 * 60 * 1000).toISOString()
    );
    expect(state.flameLit).toBe(false);
  });

  it('reports no expiry when the heart has never been lit', async () => {
    const admin = createAdmin({ count: 0, lastLitAt: null });

    const state = await getVigilPublicState(admin as never, NOW);

    expect(state.lastLitAt).toBeNull();
    expect(state.flameExpiresAt).toBeNull();
    expect(state.flameLit).toBe(false);
  });

  it('fails closed when the private claim source cannot be read', async () => {
    await expect(
      getVigilPublicState(
        createAdmin({ claimError: { message: 'permission denied' } }) as never,
        NOW
      )
    ).rejects.toThrow(/supporter count failed/i);
  });
});
