/** @jest-environment node */

jest.mock('@/lib/serverAuth', () => {
  const state = {
    ready: [] as Array<{ id: string; priority: number }>,
    optOuts: new Set<string>(),
    updates: [] as Array<Record<string, unknown>>,
    reset() {
      state.ready = [];
      state.optOuts = new Set();
      state.updates = [];
    },
  };

  class Builder {
    private op: 'select' | 'update' | 'insert' = 'select';
    private columns = '';
    private payload: Record<string, unknown> | null = null;
    private filters: Record<string, unknown> = {};

    constructor(private readonly table: string) {}

    select(columns = '*') {
      if (this.op === 'select') this.columns = columns;
      return this;
    }
    insert(payload: Record<string, unknown>) {
      this.op = 'insert';
      this.payload = payload;
      return this;
    }
    update(payload: Record<string, unknown>) {
      this.op = 'update';
      this.payload = payload;
      return this;
    }
    eq(key: string, value: unknown) {
      this.filters[key] = value;
      return this;
    }
    in(key: string, value: unknown) {
      this.filters[key] = value;
      return this;
    }
    is(key: string, value: unknown) {
      this.filters[key] = value;
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    maybeSingle() {
      return Promise.resolve(this.resolve(false));
    }
    single() {
      return Promise.resolve(this.resolve(false));
    }
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(this.resolve(true)).then(resolve, reject);
    }

    private resolve(script: boolean) {
      if (this.table === 'pierrot_dev_prompts') {
        if (this.op === 'select' && this.columns === 'queue_position') {
          return { data: [], error: null };
        }
        if (this.op === 'select') {
          return { data: state.ready, error: null };
        }
        if (this.op === 'update') {
          state.updates.push({ ...this.payload, id: this.filters.id });
          return { data: null, error: null };
        }
      }
      if (this.table === 'pierrot_dev_settings' && this.op === 'select') {
        const keys = Array.isArray(this.filters.key) ? (this.filters.key as string[]) : [];
        const data = keys
          .filter((key) => state.optOuts.has(key))
          .map((key) => ({ key, value: { at: new Date().toISOString() } }));
        return { data, error: null };
      }
      if (this.table === 'pierrot_dev_events' && this.op === 'insert') {
        return { data: null, error: null };
      }
      return { data: script ? null : null, error: null };
    }
  }

  return {
    getServerSupabaseClient: () => ({ from: (table: string) => new Builder(table) }),
    __state: state,
  };
});

import * as serverAuth from '@/lib/serverAuth';
import { promoteStandaloneReadyTasks } from '../store';

const state = (
  serverAuth as unknown as {
    __state: {
      ready: Array<{ id: string; priority: number }>;
      optOuts: Set<string>;
      updates: Array<Record<string, unknown>>;
      reset: () => void;
    };
  }
).__state;

const TASK_A = '33333333-3333-4333-8333-333333333333';
const TASK_B = '44444444-4444-4444-8444-444444444444';

describe('standalone ready-task promotion', () => {
  beforeEach(() => state.reset());

  it('promotes approved standalone tasks when there was no explicit dequeue', async () => {
    state.ready = [{ id: TASK_A, priority: 0 }];

    await expect(promoteStandaloneReadyTasks()).resolves.toBe(1);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ id: TASK_A, status: 'queued' });
  });

  it('never resurrects a task the owner explicitly dequeued', async () => {
    state.ready = [{ id: TASK_A, priority: 0 }];
    state.optOuts.add(`queue:optout:${TASK_A}`);

    await expect(promoteStandaloneReadyTasks()).resolves.toBe(0);
    expect(state.updates).toHaveLength(0);
  });

  it('promotes an unmarked task while leaving a dequeued task alone', async () => {
    state.ready = [
      { id: TASK_A, priority: 1 },
      { id: TASK_B, priority: 0 },
    ];
    state.optOuts.add(`queue:optout:${TASK_A}`);

    await expect(promoteStandaloneReadyTasks()).resolves.toBe(1);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({ id: TASK_B, status: 'queued' });
  });
});
