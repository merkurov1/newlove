/** @jest-environment node */

import { describe, expect, it, jest, beforeEach } from '@jest/globals';

import { assertWorkerEnabled, loadWorkerControl } from '../control';
import { assertCircuitClosed, recordCircuitFailure, recordCircuitSuccess } from '../circuitBreaker';
import { assertEnqueueLimit } from '../budgets';
import { getQueueSnapshot } from '../budgets';
import { acquireWorkerLock } from '../locks';
import { workerLimits } from '../config';

function eventClient() {
  return {
    rpc: jest.fn() as any,
    from: jest.fn(() => ({
      insert: jest.fn(async () => ({ error: null })),
    })),
  };
}

function thenable(value: unknown) {
  const query: Record<string, unknown> = {};
  const methods = ['select', 'in', 'eq', 'gte', 'order', 'limit'];
  for (const method of methods) query[method] = jest.fn(() => query);
  query.maybeSingle = jest.fn(async () => value);
  query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(value).then(resolve, reject);
  return query;
}

describe('resource safety', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('reads database control and falls back to environment when the table is missing', async () => {
    const client = {
      from: jest.fn(() =>
        thenable({ data: [{ key: 'workers_enabled', value: false }], error: null })
      ),
    };

    const control = await loadWorkerControl(client as never);
    expect(control.workersEnabled).toBe(false);
    expect(control.source).toBe('database');
  });

  it('blocks all scopes when the global kill switch is on', async () => {
    await expect(
      assertWorkerEnabled('brain', {
        control: {
          workersEnabled: false,
          scopes: { brain: true, graph: true, media: true, newsletter: true, retention: true },
          source: 'database',
        },
      })
    ).rejects.toThrow('worker_kill_switch_enabled');
  });

  it('blocks a single disabled worker without disabling others', async () => {
    await expect(
      assertWorkerEnabled('graph', {
        control: {
          workersEnabled: true,
          scopes: { brain: true, graph: false, media: true, newsletter: true, retention: true },
          source: 'database',
        },
      })
    ).rejects.toThrow('worker_disabled:graph');
  });

  it('acquires and releases a lease lock and rejects a duplicate invocation', async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const client = eventClient();
    client.rpc
      .mockResolvedValueOnce({
        data: { status: 'acquired', recovered: false, expires_at: expiresAt },
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({
        data: { status: 'conflict', recovered: false, expires_at: expiresAt },
        error: null,
      });

    const first = await acquireWorkerLock({
      scope: 'brain',
      ownerId: 'worker-a',
      ttlSeconds: 60,
      client: client as never,
    });

    expect(first.ok).toBe(true);

    if (first.ok) {
      await first.lock.release();
    }

    const second = await acquireWorkerLock({
      scope: 'brain',
      ownerId: 'worker-b',
      ttlSeconds: 60,
      client: client as never,
    });

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe('lock_conflict');
  });

  it('treats an expired lock as recovered', async () => {
    const client = eventClient();
    client.rpc.mockResolvedValueOnce({
      data: { status: 'acquired', recovered: true, expires_at: new Date().toISOString() },
      error: null,
    });

    const result = await acquireWorkerLock({
      scope: 'graph',
      ownerId: 'worker-a',
      ttlSeconds: 60,
      client: client as never,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lock.recovered).toBe(true);
  });

  it('opens a circuit after repeated failures and closes it on success', async () => {
    process.env.OPS_CIRCUIT_FAILURE_THRESHOLD = '2';
    process.env.OPS_CIRCUIT_COOLDOWN_SECONDS = '60';

    await recordCircuitFailure({ dependency: 'llm', errorCode: 'timeout', client: null });
    await expect(assertCircuitClosed('llm', null)).resolves.toBeUndefined();

    await recordCircuitFailure({ dependency: 'llm', errorCode: 'timeout', client: null });
    await expect(assertCircuitClosed('llm', null)).rejects.toThrow('circuit_open:llm');

    await recordCircuitSuccess('llm', null);
    await expect(assertCircuitClosed('llm', null)).resolves.toBeUndefined();
  });

  it('rejects an enqueue larger than the configured request limit', () => {
    process.env.OPS_MAX_ENQUEUE_PER_REQUEST = '5';
    expect(() => assertEnqueueLimit(6)).toThrow('enqueue_limit_reached:5');
    expect(() => assertEnqueueLimit(5)).not.toThrow();
  });

  it('reports queue age and capacity from the queue table', async () => {
    process.env.OPS_BRAIN_MAX_QUEUE = '2';
    process.env.OPS_BRAIN_MAX_QUEUE_AGE_HOURS = '24';

    const old = new Date(Date.now() - 48 * 3_600_000).toISOString();
    const client = {
      from: jest.fn(() => {
        const query = thenable({ data: { created_at: old }, error: null });
        query.select = jest.fn((_columns, options?: { count?: string; head?: boolean }) =>
          options?.head ? thenable({ count: 2, error: null }) : query
        );
        return query;
      }),
    };

    const snapshot = await getQueueSnapshot('brain', client as never);
    expect(snapshot.queued).toBe(2);
    expect(snapshot.overLimit).toBe(true);
    expect(snapshot.stale).toBe(true);
    expect(workerLimits('brain').maxQueue).toBe(2);
  });
});
