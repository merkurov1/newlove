/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';

import { cleanupStaleNewsletterSignups } from '../retention';

type Call = { table: string; method: string; args: unknown[] };

function makeStore(
  options: {
    pending?: Array<{ id: string; createdAt: string }>;
    auditError?: unknown;
    deleteError?: unknown;
    tokenDeleteError?: unknown;
  } = {}
) {
  const calls: Call[] = [];
  const events: Array<Record<string, unknown>> = [];
  const deletedSubscribers: string[] = [];
  let pending = [...(options.pending ?? [])];

  const builder = (table: string, mode: 'select' | 'delete-subscriber' | 'delete-token') => {
    const state: { limit: number | null } = { limit: null };
    const record = (method: string, args: unknown[]) => calls.push({ table, method, args });

    const node: Record<string, unknown> = {
      select: (...args: unknown[]) => {
        record('select', args);
        if (mode === 'delete-token') return node;
        return node;
      },
      eq: (...args: unknown[]) => {
        record('eq', args);
        return node;
      },
      is: (...args: unknown[]) => {
        record('is', args);
        return node;
      },
      lt: (...args: unknown[]) => {
        record('lt', args);
        return node;
      },
      order: (...args: unknown[]) => {
        record('order', args);
        return node;
      },
      limit: (...args: unknown[]) => {
        record('limit', args);
        state.limit = Number(args[0]);
        return node;
      },
      then: (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown
      ) => {
        if (mode === 'select') {
          const page = state.limit ? pending.slice(0, state.limit) : pending;
          return Promise.resolve({ data: page, error: null }).then(resolve, reject);
        }

        if (mode === 'delete-subscriber') {
          if (options.deleteError) {
            return Promise.resolve({ error: options.deleteError }).then(resolve, reject);
          }
          const id = calls.filter((call) => call.table === 'subscribers' && call.method === 'eq').at(-4)
            ?.args[1] as string | undefined;
          // Remove every pending row; the real query filters by the row id.
          if (pending.length > 0) {
            const removed = pending[0];
            pending = pending.slice(1);
            deletedSubscribers.push(String(removed.id));
            if (id) deletedSubscribers[deletedSubscribers.length - 1] = String(id);
          }
          return Promise.resolve({ error: null }).then(resolve, reject);
        }

        if (options.tokenDeleteError) {
          return Promise.resolve({ error: options.tokenDeleteError }).then(resolve, reject);
        }
        return Promise.resolve({ data: [{ id: 'token-1' }], error: null }).then(resolve, reject);
      },
    };

    return node;
  };

  const store = {
    from(table: string) {
      if (table === 'subscribers') {
        return {
          select: (...args: unknown[]) => {
            calls.push({ table, method: 'select', args });
            return builder(table, 'select');
          },
          delete: () => {
            calls.push({ table, method: 'delete', args: [] });
            return builder(table, 'delete-subscriber');
          },
        };
      }

      if (table === 'subscriber_tokens') {
        return {
          delete: () => {
            calls.push({ table, method: 'delete', args: [] });
            return builder(table, 'delete-token');
          },
        };
      }

      if (table === 'subscription_events') {
        return {
          upsert: async (row: Record<string, unknown>) => {
            calls.push({ table, method: 'upsert', args: [row] });
            events.push(row);
            return { error: options.auditError ?? null };
          },
        };
      }

      throw new Error(`Unexpected table ${table}`);
    },
  };

  return { store, calls, events, deletedSubscribers };
}

const now = new Date('2026-11-20T12:00:00.000Z');

describe('stale newsletter retention', () => {
  it('purges only stale pending rows and records an audit event first', async () => {
    const fake = makeStore({
      pending: [{ id: 'sub-old', createdAt: '2026-09-01T00:00:00.000Z' }],
    });

    const result = await cleanupStaleNewsletterSignups(fake.store as never, {
      now,
      pendingDays: 30,
      batchSize: 10,
    });

    expect(result.purgedSubscribers).toBe(1);
    expect(result.purgedTokens).toBe(1);
    expect(fake.events[0]).toMatchObject({
      event_name: 'subscription_failed',
      event_key: 'pending_expired:sub-old',
      subscriber_id: 'sub-old',
      payload: { reason: 'pending_expired' },
    });
    expect(JSON.stringify(fake.events[0])).not.toContain('@');

    const filters = fake.calls.map((call) => `${call.table}.${call.method}:${call.args.join(':')}`);
    expect(filters).toContain('subscribers.eq:isActive:false');
    expect(filters).toContain('subscribers.is:confirmedAt:');
    expect(filters).toContain('subscribers.is:unsubscribedAt:');
    expect(filters.some((value) => value.includes('subscribers.lt:createdAt'))).toBe(true);
    expect(filters.some((value) => value.includes('subscriber_tokens.lt:expires_at'))).toBe(true);
  });

  it('keeps the pending row when the audit event cannot be stored', async () => {
    const fake = makeStore({
      pending: [{ id: 'sub-old', createdAt: '2026-09-01T00:00:00.000Z' }],
      auditError: { code: 'db' },
    });

    const result = await cleanupStaleNewsletterSignups(fake.store as never, {
      now,
      pendingDays: 30,
    });

    expect(result.purgedSubscribers).toBe(0);
    expect(result.skippedSubscribers).toBe(1);
    expect(fake.deletedSubscribers).toHaveLength(0);
  });

  it('is idempotent on repeated runs', async () => {
    const fake = makeStore({
      pending: [{ id: 'sub-old', createdAt: '2026-09-01T00:00:00.000Z' }],
    });

    const first = await cleanupStaleNewsletterSignups(fake.store as never, {
      now,
      pendingDays: 30,
    });
    const second = await cleanupStaleNewsletterSignups(fake.store as never, {
      now,
      pendingDays: 30,
    });

    expect(first.purgedSubscribers).toBe(1);
    expect(second.purgedSubscribers).toBe(0);
    expect(fake.events).toHaveLength(1);
  });
});
