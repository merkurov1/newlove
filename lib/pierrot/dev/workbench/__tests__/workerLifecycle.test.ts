/** @jest-environment node */

jest.mock('@/lib/serverAuth', () => {
  const state = {
    updates: [] as Array<{
      table: string;
      payload: Record<string, unknown>;
      filters: Record<string, unknown>;
    }>,
    reset() {
      state.updates = [];
    },
  };

  class Builder {
    private op: 'select' | 'update' = 'select';
    private payload: Record<string, unknown> = {};
    private filters: Record<string, unknown> = {};

    constructor(private readonly table: string) {}

    select() {
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
    is() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    maybeSingle() {
      return Promise.resolve({ data: null, error: null });
    }
    single() {
      return Promise.resolve({ data: null, error: null });
    }
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      if (this.op === 'update') {
        state.updates.push({ table: this.table, payload: this.payload, filters: this.filters });
      }
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    }
  }

  return {
    getServerSupabaseClient: () => ({ from: (table: string) => new Builder(table) }),
    __state: state,
  };
});

import * as serverAuth from '@/lib/serverAuth';
import { clearWorkerAttempt } from '../store';

const state = (
  serverAuth as unknown as {
    __state: {
      updates: Array<{
        table: string;
        payload: Record<string, unknown>;
        filters: Record<string, unknown>;
      }>;
      reset: () => void;
    };
  }
).__state;

const ATTEMPT_ID = 'aaaaaaaa-1111-4111-8111-111111111111';

beforeEach(() => state.reset());

describe('worker sign-off', () => {
  it('marks a finished GitHub Actions runner offline and clears its pointers', async () => {
    await clearWorkerAttempt('actions:123:1', ATTEMPT_ID);

    expect(state.updates).toHaveLength(1);
    expect(state.updates[0]).toMatchObject({
      table: 'pierrot_dev_workers',
      payload: {
        status: 'offline',
        current_task_id: null,
        current_attempt_id: null,
      },
      filters: {
        id: 'actions:123:1',
        current_attempt_id: ATTEMPT_ID,
      },
    });
  });

  it('keeps a Codespace worker reusable as idle after its attempt', async () => {
    await clearWorkerAttempt('codespace:test', ATTEMPT_ID);

    expect(state.updates[0]).toMatchObject({
      payload: { status: 'idle' },
    });
  });
});
