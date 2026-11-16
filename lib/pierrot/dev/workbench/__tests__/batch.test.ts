/** @jest-environment node */

jest.mock('@/lib/serverAuth', () => {
  type TaskRow = { id: string; title: string; status: string };
  const state = {
    batchStatus: 'draft',
    items: [] as Array<{ task_id: string; position: number }>,
    tasks: [] as TaskRow[],
    reset() {
      state.batchStatus = 'draft';
      state.items = [];
      state.tasks = [];
    },
  };

  class Builder {
    private op: 'select' | 'insert' | 'update' = 'select';
    private columns = '';
    private payload: Record<string, unknown> | null = null;
    private filters: Record<string, unknown> = {};
    private selectedId = false;

    constructor(private readonly table: string) {}

    select(columns = '*') {
      if (this.op === 'select') this.columns = columns;
      else this.selectedId = columns.includes('id');
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

    order() {
      return this;
    }

    limit() {
      return this;
    }

    maybeSingle() {
      return Promise.resolve(this.resolve(true));
    }

    single() {
      return Promise.resolve(this.resolve(true));
    }

    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(this.resolve(false)).then(resolve, reject);
    }

    private resolve(single: boolean) {
      if (this.table === 'pierrot_dev_batches') {
        if (this.op === 'select') {
          const row = { id: 'batch-1', status: state.batchStatus };
          return { data: single ? row : [row], error: null };
        }
        if (this.op === 'update') {
          if (this.payload?.status === 'active') state.batchStatus = 'active';
          if (this.payload?.status === 'completed') state.batchStatus = 'completed';
          return { data: this.selectedId ? [{ id: 'batch-1' }] : null, error: null };
        }
      }

      if (this.table === 'pierrot_dev_batch_items') {
        return { data: state.items, error: null };
      }

      if (this.table === 'pierrot_dev_prompts') {
        if (this.op === 'select') {
          if (this.columns === 'queue_position') {
            return { data: single ? null : [], error: null };
          }
          if (this.columns === 'id,status') {
            return {
              data: state.tasks.map((task) => ({ id: task.id, status: task.status })),
              error: null,
            };
          }
          return { data: state.tasks, error: null };
        }
        if (this.op === 'update') {
          const task = state.tasks.find((item) => item.id === this.filters.id);
          if (task && typeof this.payload?.status === 'string') {
            task.status = this.payload.status;
          }
          return { data: null, error: null };
        }
      }

      return { data: null, error: null };
    }
  }

  return {
    getServerSupabaseClient: () => ({ from: (table: string) => new Builder(table) }),
    __state: state,
  };
});

import * as serverAuth from '@/lib/serverAuth';
import { maybeCompleteBatch, startBatch } from '../store';

const state = (
  serverAuth as unknown as {
    __state: {
      batchStatus: string;
      items: Array<{ task_id: string; position: number }>;
      tasks: Array<{ id: string; title: string; status: string }>;
      reset: () => void;
    };
  }
).__state;

const BATCH_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

describe('batch start', () => {
  beforeEach(() => state.reset());

  it('queues ready tasks in order and marks the batch active', async () => {
    state.batchStatus = 'draft';
    state.items = [
      { task_id: 'task-a', position: 0 },
      { task_id: 'task-b', position: 1 },
    ];
    state.tasks = [
      { id: 'task-a', title: 'A', status: 'ready' },
      { id: 'task-b', title: 'B', status: 'ready' },
    ];

    const result = await startBatch(USER_ID, BATCH_ID);

    expect(result).toMatchObject({ ok: true, queued: 2 });
    expect(state.tasks.map((task) => task.status)).toEqual(['queued', 'queued']);
    expect(state.batchStatus).toBe('active');
  });

  it('refuses to start a batch that still contains draft tasks', async () => {
    state.batchStatus = 'draft';
    state.items = [{ task_id: 'task-a', position: 0 }];
    state.tasks = [{ id: 'task-a', title: 'A', status: 'draft' }];

    const result = await startBatch(USER_ID, BATCH_ID);

    expect(result).toMatchObject({ ok: false, error: 'BATCH_NOT_READY' });
    expect(state.tasks[0].status).toBe('draft');
    expect(state.batchStatus).toBe('draft');
  });

  it('does not restart a completed batch', async () => {
    state.batchStatus = 'completed';
    state.items = [{ task_id: 'task-a', position: 0 }];
    state.tasks = [{ id: 'task-a', title: 'A', status: 'review' }];

    await expect(startBatch(USER_ID, BATCH_ID)).resolves.toMatchObject({
      ok: false,
      error: 'BATCH_CLOSED',
    });
  });
});

describe('batch completion', () => {
  beforeEach(() => state.reset());

  it('completes the batch once every item left the executable queue', async () => {
    state.batchStatus = 'active';
    state.items = [
      { task_id: 'task-a', position: 0 },
      { task_id: 'task-b', position: 1 },
    ];
    state.tasks = [
      { id: 'task-a', title: 'A', status: 'review' },
      { id: 'task-b', title: 'B', status: 'failed' },
    ];

    await expect(maybeCompleteBatch(BATCH_ID)).resolves.toBe(true);
    expect(state.batchStatus).toBe('completed');
  });

  it('keeps the batch active while a task is still queued', async () => {
    state.batchStatus = 'active';
    state.items = [{ task_id: 'task-a', position: 0 }];
    state.tasks = [{ id: 'task-a', title: 'A', status: 'queued' }];

    await expect(maybeCompleteBatch(BATCH_ID)).resolves.toBe(false);
    expect(state.batchStatus).toBe('active');
  });
});
