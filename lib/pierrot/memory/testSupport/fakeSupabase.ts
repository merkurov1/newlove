import { randomUUID } from 'crypto';

/**
 * Bounded in-memory Supabase double used by Temporal Memory, Brain Status,
 * Skill Foundry and Observatory tests. It implements only the query surface
 * those modules use and never touches a network or a real database.
 */

export type FakeRow = Record<string, unknown>;

type Filter = (row: FakeRow) => boolean;

type OrderSpec = { column: string; ascending: boolean; nullsFirst: boolean };

const DEFAULT_TABLES = [
  'pierrot_decisions',
  'pierrot_decision_events',
  'pierrot_memory_embeddings',
  'pierrot_brain_status_snapshots',
  'pierrot_skills',
  'pierrot_skill_versions',
  'pierrot_skill_runs',
  'pierrot_decision_observatory_runs',
];

function compare(left: unknown, right: unknown): number {
  return String(left ?? '').localeCompare(String(right ?? ''));
}

/**
 * Numeric columns (importance, message_index) compare numerically; ISO
 * timestamps compare as normalised instants. This keeps the double honest for
 * date-range retrieval without changing existing numeric assertions.
 */
function compareFilterValues(left: unknown, right: unknown): number {
  const leftNumber = typeof left === 'number' ? left : Number(left);
  const rightNumber = typeof right === 'number' ? right : Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }
  const leftDate = Date.parse(String(left ?? ''));
  const rightDate = Date.parse(String(right ?? ''));
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
    return leftDate - rightDate;
  }
  return compare(left, right);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class FakeQuery {
  private filters: Filter[] = [];
  private orderSpec: OrderSpec | null = null;
  private limitCount: number | null = null;
  private rangeBounds: { from: number; to: number } | null = null;
  private mode: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: FakeRow[] | null = null;
  private conflictKey = 'id';
  private countMode = false;
  private singleMode: 'none' | 'single' | 'maybe' = 'none';

  constructor(
    private readonly db: FakeSupabase,
    private readonly table: string
  ) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (options?.count === 'exact' || options?.head) this.countMode = true;
    return this;
  }

  insert(payload: FakeRow | FakeRow[]) {
    this.mode = 'insert';
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }

  upsert(payload: FakeRow | FakeRow[], options?: { onConflict?: string }) {
    this.mode = 'upsert';
    this.payload = Array.isArray(payload) ? payload : [payload];
    this.conflictKey = options?.onConflict || 'id';
    return this;
  }

  update(payload: FakeRow) {
    this.mode = 'update';
    this.payload = [payload];
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

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  or(expression: string) {
    const parts = expression.split(',').map((part) => part.trim());
    this.filters.push((row) =>
      parts.some((part) => {
        const ilikeMatch = part.match(/^(\w+)\.ilike\.%(.*)%$/);
        if (ilikeMatch) {
          return String(row[ilikeMatch[1]] ?? '')
            .toLowerCase()
            .includes(ilikeMatch[2].toLowerCase());
        }
        const eqMatch = part.match(/^(\w+)\.eq\.(.*)$/);
        if (eqMatch) {
          return String(row[eqMatch[1]] ?? '') === eqMatch[2];
        }
        return false;
      })
    );
    return this;
  }

  contains(column: string, values: unknown[]) {
    this.filters.push((row) => {
      const current = Array.isArray(row[column]) ? (row[column] as unknown[]) : [];
      return values.every((value) => current.includes(value));
    });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push((row) => compareFilterValues(row[column], value) >= 0);
    return this;
  }

  lte(column: string, value: unknown) {
    this.filters.push((row) => compareFilterValues(row[column], value) <= 0);
    return this;
  }

  lt(column: string, value: unknown) {
    this.filters.push((row) => compareFilterValues(row[column], value) < 0);
    return this;
  }

  is(column: string, value: unknown) {
    this.filters.push((row) => (value === null ? row[column] == null : row[column] === value));
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === 'is') {
      this.filters.push((row) =>
        value === null ? row[column] != null : row[column] !== value
      );
    }
    return this;
  }

  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orderSpec = {
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

  range(from: number, to: number) {
    this.rangeBounds = { from, to };
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

  private matches(): FakeRow[] {
    return this.db.rows(this.table).filter((row) => this.filters.every((filter) => filter(row)));
  }

  private shape(data: unknown, count?: number) {
    if (this.singleMode === 'single') {
      const first = Array.isArray(data) ? data[0] : data;
      if (!first) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: first, error: null };
    }

    if (this.singleMode === 'maybe') {
      return { data: Array.isArray(data) ? (data[0] ?? null) : (data ?? null), error: null };
    }

    if (this.countMode) return { data: null, error: null, count: count ?? 0 };

    return { data: Array.isArray(data) ? data : data == null ? [] : [data], error: null };
  }

  private execute() {
    const failure = this.db.failure(this.table);
    if (failure) return { data: null, error: failure };

    if (this.mode === 'insert') {
      const now = new Date().toISOString();
      const inserted = (this.payload || []).map((payload) => {
        const row: FakeRow = {
          id: randomUUID(),
          created_at: now,
          updated_at: now,
          status: 'current',
          tags: [],
          source_refs: [],
          ...payload,
        };
        this.db.rows(this.table).push(row);
        return clone(row);
      });

      return this.shape(inserted, inserted.length);
    }

    if (this.mode === 'upsert') {
      const now = new Date().toISOString();
      const result: FakeRow[] = [];

      for (const payload of this.payload || []) {
        const rows = this.db.rows(this.table);
        const key = this.conflictKey;
        const found = rows.find((row) => row[key] !== undefined && row[key] === payload[key]);

        if (found) {
          Object.assign(found, payload, { updated_at: now });
          result.push(clone(found));
        } else {
          const row: FakeRow = {
            id: randomUUID(),
            created_at: now,
            updated_at: now,
            ...payload,
          };
          rows.push(row);
          result.push(clone(row));
        }
      }

      return this.shape(result, result.length);
    }

    if (this.mode === 'update') {
      const found = this.matches();
      const patch = this.payload?.[0] || {};
      for (const row of found) Object.assign(row, patch, { updated_at: new Date().toISOString() });
      return this.shape(
        found.map((row) => clone(row)),
        found.length
      );
    }

    if (this.mode === 'delete') {
      const found = this.matches();
      const rows = this.db.rows(this.table);
      for (const row of found) {
        const index = rows.indexOf(row);
        if (index >= 0) rows.splice(index, 1);
      }
      return this.shape([], found.length);
    }

    let found = this.matches();

    if (this.orderSpec) {
      const { column, ascending, nullsFirst } = this.orderSpec;
      found = [...found].sort((left, right) => {
        const a = left[column];
        const b = right[column];
        if (a == null && b == null) return 0;
        if (a == null) return nullsFirst ? -1 : 1;
        if (b == null) return nullsFirst ? 1 : -1;
        return compare(a, b) * (ascending ? 1 : -1);
      });
    }

    if (this.limitCount !== null) found = found.slice(0, this.limitCount);
    if (this.rangeBounds !== null) {
      found = found.slice(this.rangeBounds.from, this.rangeBounds.to + 1);
    }

    return this.shape(
      found.map((row) => clone(row)),
      found.length
    );
  }

  then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }
}

export class FakeSupabase {
  private readonly tableRows = new Map<string, FakeRow[]>();
  private readonly tableFailures = new Map<string, { code: string; message: string }>();
  private readonly rpcHandlers = new Map<
    string,
    (params: Record<string, unknown>) => { data: unknown; error: unknown }
  >();

  constructor(tables: string[] = DEFAULT_TABLES) {
    for (const table of tables) this.tableRows.set(table, []);
  }

  rows(table: string): FakeRow[] {
    const existing = this.tableRows.get(table);
    if (existing) return existing;
    const created: FakeRow[] = [];
    this.tableRows.set(table, created);
    return created;
  }

  failure(table: string) {
    return this.tableFailures.get(table) || null;
  }

  failTable(table: string, code = '42P01', message = 'relation does not exist') {
    this.tableFailures.set(table, { code, message });
  }

  clearFailure(table: string) {
    this.tableFailures.delete(table);
  }

  onRpc(
    name: string,
    handler: (params: Record<string, unknown>) => { data: unknown; error: unknown }
  ) {
    this.rpcHandlers.set(name, handler);
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  rpc(name: string, params: Record<string, unknown> = {}) {
    const handler = this.rpcHandlers.get(name);
    if (!handler) {
      return Promise.resolve({
        data: null,
        error: { code: '42883', message: `function ${name} does not exist` },
      });
    }

    try {
      return Promise.resolve(handler(params));
    } catch (error) {
      return Promise.resolve({ data: null, error });
    }
  }

  asClient(): import('@supabase/supabase-js').SupabaseClient {
    return this as unknown as import('@supabase/supabase-js').SupabaseClient;
  }

  seed(table: string, rows: FakeRow[]) {
    this.tableRows.set(
      table,
      rows.map((row) => clone(row))
    );
  }

  all(table: string): FakeRow[] {
    return this.rows(table);
  }
}

export const OWNER_ID = '11111111-1111-4111-8111-111111111111';
export const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

export function fakeEmbeddingClient(vector: number[] = [0.1, 0.2, 0.3]) {
  return {
    modelId: 'baai/bge-m3',
    dimensions: vector.length,
    async embed(texts: string[]) {
      return texts.map(() => vector);
    },
  };
}
