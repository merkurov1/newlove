/** @jest-environment node */

import { claimVigilSpark, getVigilSparkStatus } from '@/lib/vigil/claim';
import type { VigilIdentity } from '@/lib/vigil/identity';
import { VIGIL_COOLDOWN_MS } from '@/lib/vigil/cooldown';

type Row = Record<string, any>;

function createAdmin(initialClaims: Row[] = []) {
  const claims = new Map<string, Row>(
    initialClaims.map((row) => [row.identity_key, { ...row }])
  );
  const hearts = new Map<number, Row>([
    [1, { id: 1, owner_name: null, owner_id: null, last_lit_at: null }],
  ]);
  const logs: Row[] = [];

  let lock = Promise.resolve();

  function withLock<T>(work: () => T | Promise<T>): Promise<T> {
    const run = lock.then(work);
    lock = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function claimsBuilder() {
    let action: 'select' | 'update' = 'select';
    let payload: Row = {};
    const conditions: Array<(row: Row) => boolean> = [];
    let identity = '';

    const builder: any = {
      upsert(next: Row) {
        return withLock(() => {
          if (!claims.has(String(next.identity_key))) {
            claims.set(String(next.identity_key), { ...next });
          }

          return { error: null };
        });
      },
      update(next: Row) {
        action = 'update';
        payload = next;
        return builder;
      },
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        if (column === 'identity_key') identity = String(value);
        conditions.push((row) => row[column] === value);
        return builder;
      },
      lte(column: string, value: string) {
        conditions.push(
          (row) => String(row[column] || '') <= String(value)
        );
        return builder;
      },
      maybeSingle() {
        return terminal();
      },
      single() {
        return terminal();
      },
      then(resolve: any, reject: any) {
        return terminal().then(resolve, reject);
      },
    };

    function terminal(): Promise<any> {
      return withLock(() => {
        const row = claims.get(identity);

        if (action === 'update') {
          if (!row || !conditions.every((condition) => condition(row))) {
            return { data: null, error: null };
          }

          Object.assign(row, payload);
          return { data: { last_spark_at: row.last_spark_at }, error: null };
        }

        return {
          data: row ? { last_spark_at: row.last_spark_at } : null,
          error: null,
        };
      });
    }

    return builder;
  }

  function heartsBuilder() {
    let action: 'select' | 'update' | 'upsert' = 'select';
    let payload: Row = {};
    const conditions: Array<(row: Row) => boolean> = [];
    let heartId = 0;

    const builder: any = {
      update(next: Row) {
        action = 'update';
        payload = next;
        return builder;
      },
      upsert(next: Row) {
        action = 'upsert';
        payload = next;
        heartId = Number(next.id);
        return builder;
      },
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        if (column === 'id') heartId = Number(value);
        conditions.push((row) => row[column] === value);
        return builder;
      },
      neq(column: string, value: unknown) {
        conditions.push((row) => row[column] !== value);
        return builder;
      },
      maybeSingle() {
        return terminal();
      },
      single() {
        return terminal();
      },
      then(resolve: any, reject: any) {
        return terminal().then(resolve, reject);
      },
    };

    function terminal(): Promise<any> {
      return withLock(() => {
        if (action === 'update') {
          for (const row of hearts.values()) {
            if (conditions.every((condition) => condition(row))) {
              Object.assign(row, payload);
            }
          }

          return { data: null, error: null };
        }

        if (action === 'upsert') {
          const existing = hearts.get(heartId) || { id: heartId };
          const next = { ...existing, ...payload };
          hearts.set(heartId, next);
          return { data: next, error: null };
        }

        return { data: hearts.get(heartId) ?? null, error: null };
      });
    }

    return builder;
  }

  return {
    claims,
    hearts,
    logs,
    from(table: string) {
      if (table === 'vigil_spark_claims') return claimsBuilder();
      if (table === 'vigil_hearts') return heartsBuilder();
      if (table === 'temple_log') {
        return {
          insert: (row: Row) => {
            logs.push(row);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
    auth: {
      getUser: async () => ({
        data: { user: null },
        error: new Error('not configured in this fake'),
      }),
    },
  };
}

const telegram: VigilIdentity = {
  key: 'tg:100200300',
  userId: '100200300',
  displayName: 'Anna',
  source: 'telegram',
};

const supabaseIdentity: VigilIdentity = {
  key: 'sb:11111111-1111-4111-8111-111111111111',
  userId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Pilgrim',
  source: 'supabase',
};

describe('Vigil spark claim', () => {
  it('allows the first spark, records the heart once and writes the public log', async () => {
    const admin = createAdmin();

    const result = await claimVigilSpark(admin as any, telegram, 1);

    expect(result.allowed).toBe(true);
    expect(admin.claims.get(telegram.key)?.display_name).toBe('Anna');
    expect(admin.hearts.get(1)?.owner_name).toBe('Anna');
    expect(admin.logs).toHaveLength(1);
    expect(admin.logs[0]).toMatchObject({
      event_type: 'VIGIL_SPARK',
      author: 'Anna',
    });
  });

  it('rejects a second spark inside 24 hours with the remaining time', async () => {
    const lastSparkAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const admin = createAdmin([
      {
        identity_key: telegram.key,
        display_name: 'Anna',
        last_spark_at: lastSparkAt,
      },
    ]);

    const result = await claimVigilSpark(admin as any, telegram, 1);

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.remainingMs).toBeGreaterThan(22 * 60 * 60 * 1000);
      expect(result.remainingMs).toBeLessThanOrEqual(VIGIL_COOLDOWN_MS);
      expect(result.remainingLabel).toMatch(/^2[23]h/);
    }
    expect(admin.logs).toHaveLength(0);
  });

  it('allows a spark again after the full window', async () => {
    const admin = createAdmin([
      {
        identity_key: telegram.key,
        display_name: 'Anna',
        last_spark_at: new Date(
          Date.now() - VIGIL_COOLDOWN_MS - 1000
        ).toISOString(),
      },
    ]);

    const result = await claimVigilSpark(admin as any, telegram, 1);

    expect(result.allowed).toBe(true);
  });

  it('serialises simultaneous attempts so only one spark is consumed', async () => {
    const admin = createAdmin();

    const [first, second] = await Promise.all([
      claimVigilSpark(admin as any, telegram, 1),
      claimVigilSpark(admin as any, telegram, 1),
    ]);

    expect([first.allowed, second.allowed].sort()).toEqual([false, true]);
    expect(admin.logs).toHaveLength(1);
  });

  it('keys cooldown by user id, not by a shared display name', async () => {
    const admin = createAdmin([
      {
        identity_key: 'tg:999999999',
        display_name: 'Anna',
        last_spark_at: new Date().toISOString(),
      },
    ]);

    const result = await claimVigilSpark(admin as any, telegram, 1);

    expect(result.allowed).toBe(true);
  });

  it('uses a separate Supabase key and never matches a Telegram display name', async () => {
    const admin = createAdmin([
      {
        identity_key: 'tg:100200300',
        display_name: 'Pilgrim',
        last_spark_at: new Date().toISOString(),
      },
    ]);

    const result = await claimVigilSpark(admin as any, supabaseIdentity, 1);

    expect(result.allowed).toBe(true);
    expect(admin.claims.has(supabaseIdentity.key)).toBe(true);
  });

  it('reports status without consuming a spark', async () => {
    const lastSparkAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const admin = createAdmin([
      {
        identity_key: telegram.key,
        display_name: 'Anna',
        last_spark_at: lastSparkAt,
      },
    ]);

    const status = await getVigilSparkStatus(admin as any, telegram);

    expect(status.canSpark).toBe(false);
    expect(status.remainingMs).toBeGreaterThan(0);
    expect(admin.claims.get(telegram.key)?.last_spark_at).toBe(lastSparkAt);
  });
});
