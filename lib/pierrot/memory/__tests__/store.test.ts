/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildMemoryContext,
  createMemoryRecord,
  deleteMemoryRecord,
  getMemorySummary,
  listMemoryRecords,
  updateMemoryRecord,
} from '../store';

type Row = Record<string, unknown>;

function compare(a: unknown, b: unknown): number {
  return String(a ?? '').localeCompare(String(b ?? ''));
}

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private orderBy: { column: string; ascending: boolean; nullsFirst: boolean } | null = null;
  private limitCount: number | null = null;
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | null = null;
  private countMode = false;
  private singleMode: 'none' | 'single' | 'maybe' = 'none';

  constructor(
    private readonly rows: Row[],
    private readonly table: string
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (options?.count === 'exact') this.countMode = true;
    if (options?.head) this.countMode = true;
    return this;
  }

  insert(payload: Row) {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: Row) {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }

  delete(options?: { count?: string }) {
    this.mode = 'delete';
    if (options?.count === 'exact') this.countMode = true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  or(expression: string) {
    const parts = expression.split(',').map((part) => part.trim());
    this.filters.push((row) => {
      return parts.some((part) => {
        const match = part.match(/^(\w+)\.ilike\.%(.*)%$/);
        if (!match) return false;
        return String(row[match[1]] ?? '')
          .toLowerCase()
          .includes(match[2].toLowerCase());
      });
    });
    return this;
  }

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orderBy = {
      column,
      ascending: options.ascending ?? true,
      nullsFirst: options.nullsFirst ?? false,
    };
    return this;
  }

  limit(value: number) {
    this.limitCount = value;
    return this;
  }

  single() {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  private matches(): Row[] {
    return this.rows.filter((row) => this.filters.every((filter) => filter(row)));
  }

  private execute(): { data: unknown; error: null; count?: number } {
    if (this.mode === 'insert') {
      const now = new Date().toISOString();
      const row = {
        id: randomUUID(),
        created_at: now,
        updated_at: now,
        status: 'current',
        tags: [],
        source_refs: [],
        ...this.payload,
      };
      this.rows.push(row);
      return {
        data: this.singleMode === 'none' ? [row] : row,
        error: null,
      };
    }

    if (this.mode === 'update') {
      const found = this.matches();
      for (const row of found)
        Object.assign(row, this.payload, { updated_at: new Date().toISOString() });
      return {
        data: this.singleMode === 'none' ? found : (found[0] ?? null),
        error: null,
      };
    }

    if (this.mode === 'delete') {
      const found = this.matches();
      for (const row of found) {
        const index = this.rows.indexOf(row);
        if (index >= 0) this.rows.splice(index, 1);
      }
      return {
        data: null,
        error: null,
        count: found.length,
      };
    }

    let found = this.matches();

    if (this.orderBy) {
      const { column, ascending, nullsFirst } = this.orderBy;
      found = [...found].sort((left, right) => {
        const l = left[column];
        const r = right[column];
        if (l == null && r == null) return 0;
        if (l == null) return nullsFirst ? -1 : 1;
        if (r == null) return nullsFirst ? 1 : -1;
        return compare(l, r) * (ascending ? 1 : -1);
      });
    }

    if (this.limitCount !== null) found = found.slice(0, this.limitCount);

    if (this.countMode) return { data: null, error: null, count: found.length };

    return {
      data: this.singleMode === 'none' ? found : (found[0] ?? null),
      error: null,
    };
  }

  then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }
}

function fakeStore(): SupabaseClient {
  const tables = new Map<string, Row[]>();
  tables.set('pierrot_decisions', []);
  tables.set('pierrot_decision_events', []);

  return {
    from(table: string) {
      const rows = tables.get(table) ?? [];
      tables.set(table, rows);
      return new FakeQuery(rows, table) as never;
    },
  } as unknown as SupabaseClient;
}

const userId = '11111111-1111-4111-8111-111111111111';
const otherUser = '22222222-2222-4222-8222-222222222222';

describe('owner memory store', () => {
  it('creates, reads and isolates three memory kinds', async () => {
    const store = fakeStore();

    const memory = await createMemoryRecord(store, userId, {
      kind: 'memory',
      content: 'Предпочитает короткие ответы.',
    });
    const saved = await createMemoryRecord(store, userId, {
      kind: 'saved',
      title: 'Идея для институций',
      content: 'Сделать отдельную подборку работ.',
    });
    const reminder = await createMemoryRecord(store, userId, {
      kind: 'reminder',
      content: 'Проверить интеграцию с LinkedIn.',
      reviewAt: '2026-12-01T09:00:00.000Z',
    });

    expect(memory.kind).toBe('memory');
    expect(saved.kind).toBe('saved');
    expect(reminder.reviewAt).toBe('2026-12-01T09:00:00.000Z');

    const list = await listMemoryRecords(store, { userId, status: 'active' });
    expect(list.map((record) => record.kind)).toEqual(
      expect.arrayContaining(['memory', 'saved', 'reminder'])
    );

    const summary = await getMemorySummary(store, userId);
    expect(summary.counts).toEqual({ memory: 1, saved: 1, reminder: 1 });
    expect(summary.reminders).toHaveLength(1);

    expect(await listMemoryRecords(store, { userId: otherUser })).toEqual([]);
  });

  it('searches, edits, completes, archives and deletes records', async () => {
    const store = fakeStore();
    const saved = await createMemoryRecord(store, userId, {
      kind: 'saved',
      title: 'Институциональная подборка',
      content: 'Собрать работы для музеев.',
    });
    const reminder = await createMemoryRecord(store, userId, {
      kind: 'reminder',
      content: 'Проверить LinkedIn.',
    });

    const found = await listMemoryRecords(store, {
      userId,
      status: 'active',
      query: 'музеев',
    });
    expect(found.map((record) => record.id)).toEqual([saved.id]);

    const edited = await updateMemoryRecord(store, userId, saved.id, {
      content: 'Собрать работы для музеев и фондов.',
    });
    expect(edited.content).toContain('фондов');

    const completed = await updateMemoryRecord(store, userId, reminder.id, {
      status: 'completed',
    });
    expect(completed.status).toBe('completed');

    const archived = await updateMemoryRecord(store, userId, saved.id, {
      status: 'archived',
    });
    expect(archived.status).toBe('archived');

    expect(await deleteMemoryRecord(store, userId, saved.id)).toBe(true);
    expect(await listMemoryRecords(store, { userId, status: 'active' })).toHaveLength(0);
  });

  it('builds a bounded prompt context without inventing records', async () => {
    const store = fakeStore();
    await createMemoryRecord(store, userId, {
      kind: 'memory',
      content: 'Предпочитает короткие ответы.',
    });
    await createMemoryRecord(store, userId, {
      kind: 'reminder',
      content: 'Проверить LinkedIn.',
      reviewAt: '2026-12-01T09:00:00.000Z',
    });

    const context = await buildMemoryContext(store, userId);
    expect(context).toContain('OWNER MEMORY');
    expect(context).toContain('короткие ответы');
    expect(context).toContain('Проверить LinkedIn');
    expect(context).toContain('due 2026-12-01');
    expect(context).not.toContain('Несуществующая запись');
  });
});
